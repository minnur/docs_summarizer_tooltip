<?php

namespace Drupal\docs_summarizer_tooltip\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Cache\CacheBackendInterface;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\Core\Access\CsrfTokenGenerator;
use Drupal\ai\AiProviderPluginManager;
use Drupal\ai\OperationType\Chat\ChatInput;
use Drupal\ai\OperationType\Chat\ChatMessage;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * Controller for document summary AJAX requests.
 */
class DocsSummaryController extends ControllerBase {

  /**
   * The AI provider plugin manager.
   *
   * @var \Drupal\ai\AiProviderPluginManager
   */
  protected $aiProvider;

  /**
   * The cache backend.
   *
   * @var \Drupal\Core\Cache\CacheBackendInterface
   */
  protected $cache;

  /**
   * The logger factory.
   *
   * @var \Drupal\Core\Logger\LoggerChannelFactoryInterface
   */
  protected $loggerFactory;

  /**
   * The CSRF token generator.
   *
   * @var \Drupal\Core\Access\CsrfTokenGenerator
   */
  protected $csrfToken;

  /**
   * Constructs a DocsSummaryController object.
   *
   * @param \Drupal\ai\AiProviderPluginManager $ai_provider
   *   The AI provider plugin manager.
   * @param \Drupal\Core\Config\ConfigFactoryInterface $config_factory
   *   The config factory.
   * @param \Drupal\Core\Cache\CacheBackendInterface $cache
   *   The cache backend.
   * @param \Drupal\Core\Logger\LoggerChannelFactoryInterface $logger_factory
   *   The logger factory.
   * @param \Drupal\Core\Access\CsrfTokenGenerator $csrf_token_generator
   *    The CSRF token generator.
   */
  public function __construct(
    AiProviderPluginManager $ai_provider,
    ConfigFactoryInterface $config_factory,
    CacheBackendInterface $cache,
    LoggerChannelFactoryInterface $logger_factory,
    CsrfTokenGenerator $csrf_token_generator,
  ) {
    $this->aiProvider = $ai_provider;
    $this->configFactory = $config_factory;
    $this->cache = $cache;
    $this->loggerFactory = $logger_factory;
    $this->csrfToken = $csrf_token_generator;
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container) {
    return new static(
      $container->get('ai.provider'),
      $container->get('config.factory'),
      $container->get('cache.default'),
      $container->get('logger.factory'),
      $container->get('csrf_token')
    );
  }

  /**
   * Gets AI-generated summary for a document.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The request object.
   *
   * @return \Symfony\Component\HttpFoundation\JsonResponse
   *   JSON response with summary or error.
   */
  public function getSummary(Request $request) {
    // Validate CSRF token.
    $token = $request->request->get('csrf_token');
    // @todo: Uncomment CSRF validation in production.
    if (!$this->csrfToken->validate($token, 'docs_summarizer_tooltip_ajax')) {
       throw new AccessDeniedHttpException('Invalid CSRF token.');
    }

    // Get document URL from request.
    $doc_url = $request->request->get('doc_url');
    if (empty($doc_url)) {
      throw new BadRequestHttpException('Document URL is required.');
    }

    // Validate URL format.
    if (!filter_var($doc_url, FILTER_VALIDATE_URL)) {
      return new JsonResponse([
        'success' => FALSE,
        'error' => $this->t('Invalid document URL provided.'),
      ], 400);
    }

    try {
      // Check cache first.
      $cache_key = 'docs_summarizer_tooltip:' . md5($doc_url);
      $cached = $this->cache->get($cache_key);

      if ($cached && !empty($cached->data)) {
        return new JsonResponse([
          'success' => TRUE,
          'summary' => $cached->data['summary'],
          'cached' => TRUE,
        ]);
      }

      // Get AI summary.
      $summary = $this->generateAiSummary($doc_url);

      if ($summary) {
        // Cache the result.
        $config = $this->configFactory->get('docs_summarizer_tooltip.settings');
        $cache_timeout = $config->get('cache_timeout') ?: 3600;

        $this->cache->set($cache_key, [
          'summary' => $summary,
          'url' => $doc_url,
        ], time() + $cache_timeout);

        return new JsonResponse([
          'success' => TRUE,
          'summary' => $summary,
          'cached' => FALSE,
        ]);
      }
      else {
        return new JsonResponse([
          'success' => FALSE,
          'error' => $this->t('Unable to generate summary for this document.'),
        ], 500);
      }
    }
    catch (\Exception $e) {
      $this->loggerFactory->get('docs_summarizer_tooltip')->error('Error generating document summary: @message', [
        '@message' => $e->getMessage(),
      ]);

      return new JsonResponse([
        'success' => FALSE,
        'error' => $this->t('An error occurred while generating the summary.'),
      ], 500);
    }
  }

  /**
   * Generates AI summary for a document URL.
   *
   * @param string $doc_url
   *   The document URL to summarize.
   *
   * @return string|null
   *   The generated summary or NULL on failure.
   */
  protected function generateAiSummary($doc_url) {
    try {
      $config = $this->configFactory->get('docs_summarizer_tooltip.settings');

      // Get AI provider configuration.
      $preferred_model = $config->get('ai_model');
      $provider_config = $this->aiProvider->getSetProvider('chat', $preferred_model);

      if (empty($provider_config['provider_id'])) {
        throw new \Exception('No AI provider configured.');
      }

      /** @var \Drupal\ai\AiProviderInterface $ai_provider */
      $ai_provider_instance = $provider_config['provider_id'];
      $prompt = $config->get('summary_prompt');

      // Create the full prompt with document URL.
      $full_prompt = $prompt . "\n\nDocument URL: " . $doc_url;

      // Prepare chat messages.
      $messages = new ChatInput([
        new ChatMessage('user', $full_prompt),
      ]);

      // Set system role.
      $ai_provider_instance->setChatSystemRole('You are a helpful assistant that provides concise summaries of documents based on their URLs. Focus on being informative yet brief.');

      // Get AI response.
      $response = $ai_provider_instance->chat($messages, $provider_config['model_id'], [
        'docs_summarizer_tooltip',
      ])->getNormalized();

      $summary = trim($response->getText());

      // Limit summary length if configured.
      $max_length = $config->get('max_summary_length') ?: 350;
      if (strlen($summary) > $max_length) {
        $summary = substr($summary, 0, $max_length - 3) . '...';
      }

      return $summary ?: NULL;
    }
    catch (\Exception $e) {
      $this->loggerFactory->get('docs_summarizer_tooltip')->error('AI summary generation failed: @message', [
        '@message' => $e->getMessage(),
      ]);
      return NULL;
    }
  }

}
