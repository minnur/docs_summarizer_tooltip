/**
 * @file
 * Document Summarizer Tooltip vanilla implementation for Drupal.
 */

(function (Drupal, drupalSettings) {
  'use strict';

  // Cache for document summaries.
  let summaryCache = {};
  let activeRequests = {};
  let currentTooltip = null;
  let currentTriggerLink = null;
  let hoverTimeout = null;
  let supportedExtensions = [];
  let scrollHandler = null;

  /**
   * Attaches document summarizer tooltip behavior to document links.
   *
   * @type {Drupal~behavior}
   */
  Drupal.behaviors.docsSummarizerTooltip = {
    attach: function (context, settings) {
      // Check if module is enabled.
      if (!settings.docsSummarizer || !settings.docsSummarizer.enabled) {
        return;
      }

      // Get supported extensions.
      supportedExtensions = settings.docsSummarizer.supportedExtensions || [
        'pdf', 'txt', 'csv', 'html'
      ];

      // Build CSS selector for all supported document types.
      const selectors = [];
      supportedExtensions.forEach(function(ext) {
        selectors.push('a[href$=".' + ext + '"]');
        selectors.push('a[href*=".' + ext + '?"]');
        selectors.push('a[href*=".' + ext + '#"]');
      });

      // Process document links using data attribute tracking.
      const docLinks = context.querySelectorAll(selectors.join(', '));

      docLinks.forEach(function(link) {
        // Skip if already processed.
        if (link.hasAttribute('data-docs-summarizer-processed')) {
          return;
        }

        // Skip if data-no-summarizer is set to "true".
        if (link.getAttribute('data-no-summarizer') === 'true') {
          return;
        }

        const docUrl = getDocUrl(link.href);
        const docType = getDocumentType(docUrl);

        if (!docUrl || !isDocumentSupported(docUrl)) {
          return;
        }

        // Mark as processed.
        link.setAttribute('data-docs-summarizer-processed', 'true');

        // Add visual indicator class with document type.
        link.classList.add('docs-summarizer-link');
        link.classList.add('docs-summarizer-' + docType);

        // Add ARIA attributes for accessibility.
        link.setAttribute('aria-describedby', '');
        link.setAttribute('role', 'button');
        link.setAttribute('tabindex', '0');

        // Add mouse events.
        link.addEventListener('mouseenter', function(e) {
          clearTimeout(hoverTimeout);
          hoverTimeout = setTimeout(() => {
            showTooltip(link, docUrl, settings);
          }, 500);
        });

        link.addEventListener('mouseleave', function(e) {
          clearTimeout(hoverTimeout);
          setTimeout(() => {
            if (currentTooltip && !currentTooltip.matches(':hover') && document.activeElement !== link) {
              hideTooltip();
            }
          }, 200);
        });

        // Add keyboard events for accessibility.
        link.addEventListener('focus', function(e) {
          clearTimeout(hoverTimeout);
          showTooltip(link, docUrl, settings);
        });

        link.addEventListener('blur', function(e) {
          // Only hide if focus is not moving to the tooltip.
          setTimeout(() => {
            if (currentTooltip && !currentTooltip.contains(document.activeElement)) {
              hideTooltip();
            }
          }, 100);
        });

        // Add keyboard navigation.
        link.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') {
            hideTooltip();
            link.focus();
          } else if (e.key === 'Enter' || e.key === ' ') {
            if (!currentTooltip) {
              e.preventDefault();
              showTooltip(link, docUrl, settings);
            }
          }
        });
      });
    },

    detach: function (context, settings, trigger) {
      if (trigger === 'unload') {
        // Clean up.
        hideTooltip();

        // Remove processed attributes and ARIA attributes.
        const processedLinks = context.querySelectorAll('[data-docs-summarizer-processed]');
        processedLinks.forEach(function(link) {
          link.removeAttribute('data-docs-summarizer-processed');
          // Remove all document-related classes.
          const classes = link.className.split(' ').filter(cls => !cls.startsWith('docs-summarizer'));
          link.className = classes.join(' ');
          link.removeAttribute('aria-describedby');
          link.removeAttribute('role');
          link.removeAttribute('tabindex');
        });

        // Cancel active requests.
        Object.keys(activeRequests).forEach(function(url) {
          if (activeRequests[url]) {
            activeRequests[url].abort();
          }
        });
        activeRequests = {};
      }
    }
  };

  /**
   * Show tooltip for document link.
   */
  function showTooltip(link, docUrl, settings) {
    hideTooltip();

    const linkTitle = link.innerHTML;
    const filename = getFilename(docUrl);
    const docType = getDocumentType(docUrl);

    // Store reference to the trigger link
    currentTriggerLink = link;

    // Create tooltip element with accessibility attributes.
    currentTooltip = document.createElement('div');
    currentTooltip.className = 'docs-summarizer-tooltip docs-summarizer-tooltip-' + docType;
    currentTooltip.setAttribute('role', 'tooltip');
    currentTooltip.setAttribute('aria-live', 'polite');
    currentTooltip.setAttribute('aria-atomic', 'true');

    // Generate unique ID for tooltip.
    const tooltipId = 'docs-tooltip-' + Math.random().toString(36).substr(2, 9);
    currentTooltip.id = tooltipId;

    // Link the tooltip to the trigger element.
    link.setAttribute('aria-describedby', tooltipId);

    // Check cache first.
    if (summaryCache[docUrl]) {
      currentTooltip.innerHTML = formatTooltipContent(summaryCache[docUrl], linkTitle);
    } else {
      currentTooltip.innerHTML = formatTooltipContent({filename: filename, docType: docType, loading: true}, linkTitle);
      loadDocSummary(docUrl, filename, settings);
    }

    // Make tooltip focusable for keyboard users.
    currentTooltip.setAttribute('tabindex', '-1');

    // Position and show tooltip.
    document.body.appendChild(currentTooltip);
    positionTooltip(link, currentTooltip);

    // Add scroll handler to reposition tooltip
    scrollHandler = function() {
      if (currentTooltip && currentTriggerLink) {
        positionTooltip(currentTriggerLink, currentTooltip);
      }
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('resize', scrollHandler, { passive: true });

    // Add keyboard navigation to tooltip.
    currentTooltip.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        hideTooltip();
        link.focus();
      }
    });

    // Keep tooltip open when hovering over it.
    currentTooltip.addEventListener('mouseenter', function() {
      clearTimeout(hoverTimeout);
    });

    currentTooltip.addEventListener('mouseleave', function() {
      if (document.activeElement !== currentTooltip) {
        hideTooltip();
      }
    });

    // Announce to screen readers.
    announceToScreenReader(Drupal.t('@doctype summary tooltip opened for @filename', {
      '@doctype': docType.toUpperCase(),
      '@filename': filename
    }));
  }

  /**
   * Hide current tooltip.
   */
  function hideTooltip() {
    if (currentTooltip && currentTooltip.parentNode) {
      // Remove aria-describedby from the associated link.
      const associatedLink = document.querySelector('[aria-describedby="' + currentTooltip.id + '"]');
      if (associatedLink) {
        associatedLink.removeAttribute('aria-describedby');
      }

      // Remove scroll and resize event listeners
      if (scrollHandler) {
        window.removeEventListener('scroll', scrollHandler);
        window.removeEventListener('resize', scrollHandler);
        scrollHandler = null;
      }

      // Remove tooltip from DOM.
      currentTooltip.parentNode.removeChild(currentTooltip);
      currentTooltip = null;
      currentTriggerLink = null;

      // Announce to screen readers.
      announceToScreenReader(Drupal.t('Document summary tooltip closed'));
    }
  }

  /**
   * Position tooltip relative to link.
   */
  function positionTooltip(link, tooltip) {
    const rect = link.getBoundingClientRect();

    // Use fixed positioning to avoid scroll issues
    tooltip.style.position = 'fixed';
    tooltip.style.zIndex = '10000';

    // Force a reflow to get accurate dimensions
    tooltip.offsetHeight;
    const tooltipRect = tooltip.getBoundingClientRect();

    // Store original link position for consistent positioning
    const linkCenterX = rect.left + (rect.width / 2);
    const preferredTop = rect.top - tooltipRect.height - 8;

    // Calculate horizontal position (center above link)
    let left = linkCenterX - (tooltipRect.width / 2);
    let top = preferredTop;

    // Adjust horizontal position if tooltip goes off screen
    const margin = 10;
    if (left < margin) {
      left = margin;
    } else if (left + tooltipRect.width > window.innerWidth - margin) {
      left = window.innerWidth - tooltipRect.width - margin;
    }

    // Show below if not enough space above
    if (top < margin) {
      top = rect.bottom + 8;
      tooltip.classList.add('tooltip-below');
    } else {
      tooltip.classList.remove('tooltip-below');
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  /**
   * Load document summary via AJAX.
   */
  function loadDocSummary(docUrl, filename, settings) {
    // Prevent duplicate requests.
    if (activeRequests[docUrl]) {
      return;
    }

    const xhr = new XMLHttpRequest();
    activeRequests[docUrl] = xhr;

    xhr.open('POST', settings.docsSummarizer.ajaxUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.timeout = 15000;

    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.success && response.summary) {
            // Cache the result.
            summaryCache[docUrl] = {
              filename: filename,
              docType: getDocumentType(docUrl),
              summary: response.summary,
              cached: response.cached || false
            };

            // Update tooltip if still visible.
            if (currentTooltip) {
              const associatedLink = document.querySelector('[aria-describedby="' + currentTooltip.id + '"]');
              const linkTitle = associatedLink ? associatedLink.innerHTML : '';
              currentTooltip.innerHTML = formatTooltipContent(summaryCache[docUrl], linkTitle);
              // Reposition tooltip after content changes
              if (associatedLink) {
                positionTooltip(associatedLink, currentTooltip);
              }
              // Announce summary is ready.
              announceToScreenReader(Drupal.t('Document summary loaded'));
            }
          } else {
            // Show error.
            if (currentTooltip) {
              const associatedLink = document.querySelector('[aria-describedby="' + currentTooltip.id + '"]');
              const linkTitle = associatedLink ? associatedLink.innerHTML : '';
              currentTooltip.innerHTML = formatTooltipContent({
                filename: filename,
                docType: getDocumentType(docUrl),
                error: response.error || Drupal.t('Unable to generate summary')
              }, linkTitle);
              // Reposition tooltip after content changes
              if (associatedLink) {
                positionTooltip(associatedLink, currentTooltip);
              }
              // Announce error.
              announceToScreenReader(Drupal.t('Document summary failed to load'));
            }
          }
        } catch (e) {
          if (currentTooltip) {
            const associatedLink = document.querySelector('[aria-describedby="' + currentTooltip.id + '"]');
            const linkTitle = associatedLink ? associatedLink.innerHTML : '';
            currentTooltip.innerHTML = formatTooltipContent({
              filename: filename,
              docType: getDocumentType(docUrl),
              error: Drupal.t('Failed to parse response')
            }, linkTitle);
            // Reposition tooltip after content changes
            if (associatedLink) {
              positionTooltip(associatedLink, currentTooltip);
            }
            announceToScreenReader(Drupal.t('Document summary failed to load'));
          }
        }
      } else {
        if (currentTooltip) {
          const associatedLink = document.querySelector('[aria-describedby="' + currentTooltip.id + '"]');
          const linkTitle = associatedLink ? associatedLink.innerHTML : '';
          currentTooltip.innerHTML = formatTooltipContent({
            filename: filename,
            docType: getDocumentType(docUrl),
            error: Drupal.t('Failed to load summary')
          }, linkTitle);
          // Reposition tooltip after content changes
          if (associatedLink) {
            positionTooltip(associatedLink, currentTooltip);
          }
          announceToScreenReader(Drupal.t('Document summary failed to load'));
        }
      }
      delete activeRequests[docUrl];
    };

    xhr.onerror = function() {
      if (currentTooltip) {
        const associatedLink = document.querySelector('[aria-describedby="' + currentTooltip.id + '"]');
        const linkTitle = associatedLink ? associatedLink.innerHTML : '';
        currentTooltip.innerHTML = formatTooltipContent({
          filename: filename,
          docType: getDocumentType(docUrl),
          error: Drupal.t('Failed to load summary')
        }, linkTitle);
        // Reposition tooltip after content changes
        if (associatedLink) {
          positionTooltip(associatedLink, currentTooltip);
        }
        announceToScreenReader(Drupal.t('Document summary failed to load'));
      }
      delete activeRequests[docUrl];
    };

    xhr.ontimeout = function() {
      if (currentTooltip) {
        const associatedLink = document.querySelector('[aria-describedby="' + currentTooltip.id + '"]');
        const linkTitle = associatedLink ? associatedLink.innerHTML : '';
        currentTooltip.innerHTML = formatTooltipContent({
          filename: filename,
          docType: getDocumentType(docUrl),
          error: Drupal.t('Request timed out')
        }, linkTitle);
        // Reposition tooltip after content changes
        if (associatedLink) {
          positionTooltip(associatedLink, currentTooltip);
        }
        announceToScreenReader(Drupal.t('Document summary request timed out'));
      }
      delete activeRequests[docUrl];
    };

    const params = 'doc_url=' + encodeURIComponent(docUrl) +
                  '&csrf_token=' + encodeURIComponent(settings.docsSummarizer.csrfToken);
    xhr.send(params);
  }

  /**
   * Format tooltip content for loading, loaded, or error states.
   */
  function formatTooltipContent(data, linkTitle) {
    linkTitle = linkTitle || '';
    let headerContent = '';

    // Build header with optional link title.
    if (linkTitle.trim() && linkTitle.trim() !== data.filename) {
      headerContent = '<div class="docs-link-title">' + Drupal.checkPlain(linkTitle) + '</div>';
    }

    headerContent += '<div class="docs-filename-row">' +
      '<span class="docs-filename">' + Drupal.checkPlain(data.filename) + '</span>' +
      '</div>';

    let html = '<div class="docs-tooltip-header">' + headerContent + '</div>' +
      '<div class="docs-tooltip-content">';

    // Handle different states.
    if (data.loading) {
      // Loading state.
      html += '<div class="docs-loading" role="status" aria-label="' + Drupal.t('Loading document summary') + '">' +
        '<span class="sr-only">' + Drupal.t('Loading summary for @filename', {'@filename': Drupal.checkPlain(data.filename)}) + '</span>' +
        Drupal.t('Loading summary...') +
        '</div>';
    } else if (data.error) {
      // Error state.
      html += '<div class="docs-error" role="alert">' +
        '<span class="error-icon" aria-hidden="true">⚠️</span> ' +
        '<span class="error-message">' + Drupal.checkPlain(data.error) + '</span>' +
        '</div>';
    } else if (data.summary) {
      // Summary loaded state.
      html += '<div class="docs-summary" role="region" aria-label="' + Drupal.t('Document summary') + '">' +
        '<p>' + Drupal.checkPlain(data.summary) + '</p>';

      if (data.cached) {
        html += ' <span class="cache-indicator" aria-label="' + Drupal.t('Cached result') + '" title="' + Drupal.t('Cached') + '">⚡</span>';
      }

      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Get normalized document URL.
   */
  function getDocUrl(href) {
    if (!href) return null;

    // Already absolute.
    if (href.match(/^https?:\/\//)) {
      return href;
    }

    // Protocol-relative.
    if (href.indexOf('//') === 0) {
      return window.location.protocol + href;
    }

    // Root-relative.
    if (href.charAt(0) === '/') {
      return window.location.origin + href;
    }

    // Relative to current directory.
    const base = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    return base + '/' + href;
  }

  /**
   * Extract filename from URL.
   */
  function getFilename(url) {
    if (!url) return 'document';

    const cleanUrl = url.split('?')[0].split('#')[0];
    const parts = cleanUrl.split('/');
    let filename = parts[parts.length - 1];

    try {
      filename = decodeURIComponent(filename);
    } catch (e) {
      // Use original if decode fails.
    }

    return filename || 'document';
  }

  /**
   * Check if document type is supported.
   */
  function isDocumentSupported(url) {
    const ext = getDocumentExtension(url);
    return supportedExtensions.includes(ext);
  }

  /**
   * Get document type from URL.
   */
  function getDocumentType(url) {
    return getDocumentExtension(url) || 'unknown';
  }

  /**
   * Get document extension from URL.
   */
  function getDocumentExtension(url) {
    if (!url) return '';
    const cleanUrl = url.split('?')[0].split('#')[0];
    const match = cleanUrl.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  /**
   * Announce message to screen readers.
   */
  function announceToScreenReader(message) {
    // Create or get existing announcement region.
    let announcer = document.getElementById('docs-summarizer-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'docs-summarizer-announcer';
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      announcer.className = 'sr-only';
      document.body.appendChild(announcer);
    }

    // Clear previous announcement and set new one.
    announcer.textContent = '';
    setTimeout(() => {
      announcer.textContent = message;
    }, 100);
  }

})(Drupal, drupalSettings);
