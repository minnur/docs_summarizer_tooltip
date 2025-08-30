<?php

namespace Drupal\docs_summarizer_tooltip\Form;

use Drupal\Core\Config\TypedConfigManagerInterface;
use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\ai\AiProviderPluginManager;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Configuration form for Document Summarizer Tooltip settings.
 */
class DocsSummarizerTooltipSettingsForm extends ConfigFormBase {

  const SUPPORTED_EXTENSIONS = 'pdf, txt, csv, html';

  /**
   * The AI provider plugin manager.
   *
   * @var \Drupal\ai\AiProviderPluginManager
   */
  protected $aiProvider;

  /**
   * Constructs a \Drupal\system\ConfigFormBase object.
   *
   * @param \Drupal\Core\Config\ConfigFactoryInterface $config_factory
   *   The factory for configuration objects.
   * @param \Drupal\Core\Config\TypedConfigManagerInterface $typedConfigManager
   *   The typed config manager.
   */
  public function __construct(
    ConfigFactoryInterface $config_factory,
    protected TypedConfigManagerInterface $typedConfigManager,
    AiProviderPluginManager $ai_provider
  ) {
    parent::__construct($config_factory, $typedConfigManager);
    $this->aiProvider = $ai_provider;
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container) {
    return new static(
      $container->get('config.factory'),
      $container->get('config.typed'),
      $container->get('ai.provider')
    );
  }

  /**
   * {@inheritdoc}
   */
  protected function getEditableConfigNames() {
    return ['docs_summarizer_tooltip.settings'];
  }

  /**
   * {@inheritdoc}
   */
  public function getFormId() {
    return 'docs_summarizer_tooltip_settings_form';
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state) {
    $config = $this->config('docs_summarizer_tooltip.settings');

    $form['enabled'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable Summarizer (on link hover)'),
      '#description' => $this->t('When enabled, links to supported documents will show AI-generated summaries on hover.'),
      '#default_value' => $config->get('enabled') ?? TRUE,
    ];

    $form['ai_settings'] = [
      '#type' => 'fieldset',
      '#title' => $this->t('AI Configuration'),
      '#collapsible' => FALSE,
      '#states' => [
        'visible' => [
          ':input[name="enabled"]' => ['checked' => TRUE],
        ],
      ],
    ];

    // Get available AI models.
    $models = $this->aiProvider->getSimpleProviderModelOptions('chat', TRUE);

    $form['ai_settings']['ai_model'] = [
      '#type' => 'select',
      '#title' => $this->t('AI Model'),
      '#description' => $this->t('Select the AI model to use for generating PDF summaries. Leave empty to use the default model.'),
      '#options' => $models,
      '#default_value' => $config->get('ai_model'),
      '#empty_option' => $this->t('- Use default AI model -'),
    ];

    $form['ai_settings']['summary_prompt'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Summary Prompt'),
      '#description' => $this->t('The prompt sent to the AI model. The PDF URL will be appended automatically.'),
      '#default_value' => $config->get('summary_prompt') ?: 'Please provide a concise summary of this PDF document in 2-3 sentences. Focus on the main topic, key points, and purpose of the document.',
      '#rows' => 4,
    ];

    $form['ai_settings']['max_summary_length'] = [
      '#type' => 'number',
      '#title' => $this->t('Maximum Summary Length'),
      '#description' => $this->t('Maximum number of characters for the summary. Longer summaries will be truncated.'),
      '#default_value' => $config->get('max_summary_length') ?: 200,
      '#min' => 50,
      '#max' => 1000,
      '#step' => 10,
    ];

    // Add supported extensions field.
    $form['ai_settings']['supported_extensions'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Supported File Extensions'),
      '#description' => $this->t('File extensions to detect, provide file extensions separated by comma. Leave empty to use defaults.'),
      '#default_value' => implode(', ', $config->get('supported_extensions')) ?: self::SUPPORTED_EXTENSIONS,
      '#placeholder' => $this->t(self::SUPPORTED_EXTENSIONS),
    ];

    $form['ai_settings']['cache_timeout'] = [
      '#type' => 'number',
      '#title' => $this->t('Cache Timeout'),
      '#description' => $this->t('How long (in seconds) to cache AI-generated summaries. Set to 0 to disable caching.'),
      '#default_value' => $config->get('cache_timeout') ?: 3600,
      '#min' => 0,
      '#max' => 86400, // 24 hours
      '#step' => 60,
      '#field_suffix' => $this->t('seconds'),
    ];
    return parent::buildForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function validateForm(array &$form, FormStateInterface $form_state) {
    parent::validateForm($form, $form_state);

    // Validate AI model selection.
    if ($form_state->getValue('enabled') && $form_state->getValue('ai_model')) {
      $models = $this->aiProvider->getSimpleProviderModelOptions('chat', FALSE);
      if (!isset($models[$form_state->getValue('ai_model')])) {
        $form_state->setErrorByName('ai_model', $this->t('Selected AI model is not available.'));
      }
    }

    // Validate summary prompt.
    $prompt = trim($form_state->getValue('summary_prompt'));
    if ($form_state->getValue('enabled') && empty($prompt)) {
      $form_state->setErrorByName('summary_prompt', $this->t('Summary prompt cannot be empty when the module is enabled.'));
    }
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state) {
    $config = $this->config('docs_summarizer_tooltip.settings');

    $extensions_text = trim($form_state->getValue('supported_extensions'));
    $extensions = $extensions_text ? array_filter(array_map('trim', explode(',', $extensions_text))) : [];

    $config
      ->set('enabled', $form_state->getValue('enabled'))
      ->set('ai_model', $form_state->getValue('ai_model'))
      ->set('summary_prompt', trim($form_state->getValue('summary_prompt')))
      ->set('max_summary_length', $form_state->getValue('max_summary_length'))
      ->set('cache_timeout', $form_state->getValue('cache_timeout'))
      ->set('supported_extensions', $extensions)
      ->save();

    parent::submitForm($form, $form_state);
  }

}
