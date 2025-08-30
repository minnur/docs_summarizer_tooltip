# Document Summarizer Tooltip

Automatically detects document files (PDF, TXT, CSV, HTML etc.) on pages and provides AI-generated summaries in tooltips on hover.
`This module was built with AI assistance.`

## Features

- Automatic document (PDF, TXT etc.) link detection on web pages
- AI-powered summarization using Drupal's AI module
- Hover tooltips with document summaries
- Caching system for improved performance
- Mobile-responsive design
- Configurable AI models and prompts
- Dark mode support
- Accessibility features

## Requirements

- Drupal 10.3+ or Drupal 11+
- PHP 8.1+
- AI module (drupal/ai)
- An AI provider configured (e.g., OpenAI)

## Installation

1. Install the module and its dependencies:
   ```bash
   composer require drupal/ai
   ```

2. Enable the module:
   ```bash
   drush pm:install docs_summarizer_tooltip
   ```

3. Configure the AI provider at `/admin/config/ai`

4. Configure the Document Summarizer at `/admin/config/ai/docs-summarizer-tooltip`

## Configuration

Visit **Administration » Configuration » AI » PDF Summarizer Settings** to configure:

### General Settings
- Enable/disable the module
- Select AI model for summaries
- Customize the summary prompt
- Set maximum summary length
- etc.

## Usage

Once enabled and configured, the module automatically:

1. Detects PDF links on pages using patterns like:
   - `href$=".pdf"`
   - `href*=".pdf?"`
   - `href*=".pdf#"`

2. Adds a PDF icon indicator next to detected links

3. Shows AI-generated summaries in tooltips when users hover over PDF links

4. Caches summaries for improved performance

### Excluding Specific Links

To prevent tooltips on specific PDF links, add the `data-no-summarizer="true"` attribute:

```html
<a href="document.pdf" data-no-summarizer="true">Download PDF</a>
```

## Customization

### CSS Classes
- `.docs-summarizer-link` - Applied to detected document links
- `.docs-summarizer-tooltip` - Main tooltip container
- `.docs-tooltip-header` - Tooltip header with filename
- `.docs-tooltip-content` - Tooltip content area
- `.docs-loading` - Loading state styles
- `.docs-error` - Error state styles

### JavaScript Events
The module uses Drupal behaviors and can be extended through custom JavaScript.

## Performance Considerations

- Summaries are cached by default for 1 hour
- Only processes non-admin pages
- Uses efficient CSS selectors for PDF detection
- Implements request deduplication
- Supports reduced motion preferences

## Accessibility

The PDF Summarizer module follows WCAG 2.1 AA accessibility standards:

### Keyboard Navigation
- **Tab Navigation**: PDF links are focusable with Tab key
- **Activation**: Press Enter or Space to show/hide tooltips
- **Escape Key**: Close tooltip and return focus to trigger link
- **Focus Management**: Proper focus indicators and management

### Screen Reader Support
- **ARIA Attributes**: Tooltips use proper ARIA roles and properties
- **Live Regions**: Status announcements for loading, success, and errors
- **Screen Reader Text**: Hidden text provides context for icons and states
- **Semantic Structure**: Proper heading hierarchy and landmark roles

### Visual Accessibility
- **High Contrast Mode**: Enhanced borders and colors for better visibility
- **Focus Indicators**: Clear visual focus rings for keyboard users
- **Reduced Motion**: Respects user motion preferences, disables animations
- **Color Independence**: Information not conveyed through color alone

### ARIA Implementation
- `role="tooltip"` on tooltip containers
- `aria-describedby` linking tooltips to trigger elements
- `aria-live="polite"` for status updates
- `role="status"` for loading states
- `role="alert"` for error messages
- `role="region"` for summary content areas

## Troubleshooting

### No tooltips appearing
1. Check if the module is enabled at `/admin/config/ai/docs-summarizer-tooltip`
2. Verify AI provider is configured at `/admin/config/ai`
3. Check browser console for JavaScript errors
4. Ensure document links match the supported file extensions

### AI summaries failing
1. Verify AI provider credentials
2. Check Drupal logs for error messages
3. Test AI provider configuration
4. Review summary prompt configuration
