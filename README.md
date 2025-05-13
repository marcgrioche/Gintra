# Gintra Calendar Sync

A browser extension that seamlessly synchronizes events from the Epitech intranet with your Google Calendar. Simplify your schedule management by automatically importing your Epitech events into Google Calendar.

## Features

- Automatic event extraction from Epitech intranet
- One-click synchronization with Google Calendar
- Easy-to-use popup interface
- Secure OAuth2 authentication
- Support for all Epitech domains

## Installation

1. Download the extension files
2. Open Chrome/Chromium browser and go to `chrome://extensions/`
3. Enable "Developer Mode" in the top right corner
4. Click "Load unpacked" and select the extension directory

### Required Permissions

The extension requires the following permissions for proper functionality:

- `activeTab`: To interact with the Epitech intranet pages
- `storage`: To store sync preferences and settings
- `scripting`: To extract event information
- `identity`: For secure Google OAuth2 authentication
- `downloads`: To handle calendar data
- Access to Epitech domains and Google Calendar API

## Usage

1. Click on the extension icon in your browser toolbar
2. Log in with your Google account when prompted (first use only)
3. Navigate to your Epitech intranet page containing calendar events
4. Use the popup interface to sync events with your Google Calendar

## Technical Details

- Uses OAuth2 for secure Google Calendar integration
- Client ID: Configured for Google Calendar API access
- Content script runs only on Epitech domains
- Background service worker handles API communication

## Support

For bug reports, feature requests, or technical issues, please contact:
- Email: marc.grioche@epitech.eu

## Security

Your data security is important:
- OAuth2 authentication ensures secure access to Google Calendar
- No sensitive data is stored locally
- All API communications are encrypted
