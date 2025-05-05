document.addEventListener('DOMContentLoaded', function() {
    const extractButton = document.getElementById('extractEvents');
    const exportIcsButton = document.getElementById('exportIcs');
    const syncGoogleCalButton = document.getElementById('syncGoogleCal');
    const eventListElement = document.getElementById('eventList');
    const statusElement = document.getElementById('status');
    const loaderElement = document.getElementById('loader');

    let extractedEvents = [];

    // Extract events button click handler
    extractButton.addEventListener('click', function() {
      showLoader();
      clearStatus();

      // Query the active tab
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        // Send message to content script
        chrome.tabs.sendMessage(tabs[0].id, {action: 'getEvents'}, function(response) {
          hideLoader();

          if (response && response.events) {
            extractedEvents = response.events;

            if (extractedEvents.length > 0) {
              displayEvents(extractedEvents);
              enableButtons();
              showStatus('Successfully extracted ' + extractedEvents.length + ' events.', 'success');
            } else {
              eventListElement.innerHTML = '<p>No registered events found on this page.</p>';
              disableButtons();
              showStatus('No registered events found.', 'error');
            }
          } else {
            eventListElement.innerHTML = '<p>Error extracting events. Make sure you are on the correct intranet page.</p>';
            disableButtons();
            showStatus('Error extracting events. Are you on the correct page?', 'error');
          }
        });
      });
    });

    // Export to ICS file button click handler
    exportIcsButton.addEventListener('click', function() {
      if (extractedEvents.length === 0) {
        showStatus('No events to export.', 'error');
        return;
      }

      showLoader();

      // Generate ICS content
      const icsContent = generateIcsContent(extractedEvents);

      // Create a Blob and download link
      const blob = new Blob([icsContent], {type: 'text/calendar'});
      const url = URL.createObjectURL(blob);

      // Create download
      chrome.downloads.download({
        url: url,
        filename: 'intranet_events.ics',
        saveAs: true
      }, function() {
        hideLoader();
        showStatus('ICS file generated successfully.', 'success');
      });
    });

    // Sync with Google Calendar button click handler
    syncGoogleCalButton.addEventListener('click', function() {
      if (extractedEvents.length === 0) {
        showStatus('No events to sync.', 'error');
        return;
      }

      showLoader();

      // Send events to background script for Google Calendar API interaction
      chrome.runtime.sendMessage({
        action: 'syncWithGoogleCalendar',
        events: extractedEvents
      }, function(response) {
        hideLoader();

        if (response && response.success) {
          showStatus('Events synced with Google Calendar successfully.', 'success');
        } else {
          showStatus('Error syncing with Google Calendar: ' + (response ? response.error : 'Unknown error'), 'error');
        }
      });
    });

    // Helper function to display events in the popup
    function displayEvents(events) {
      eventListElement.innerHTML = '';

      events.forEach(function(event) {
        const eventItem = document.createElement('div');
        eventItem.className = 'event-item';

        // Format date and time for display
        const date = new Date(event.startTime);
        const formattedDate = date.toLocaleDateString(event.language === 'fr' ? 'fr-FR' : 'en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        const startTime = formatDateTime(event.startTime);
        const endTime = formatDateTime(event.endTime);

        // Create event display HTML
        eventItem.innerHTML = `
          <div><strong>${event.group} - ${event.course}</strong></div>
          <div><em>${event.activity || 'No activity specified'}</em></div>
          <div>Room ${event.room}</div>
          <div>${formattedDate}</div>
          <div>${startTime} - ${endTime}</div>
        `;

        eventListElement.appendChild(eventItem);
      });
    }

    // Helper function to format date and time
    function formatDateTime(isoString) {
      if (!isoString) return 'Time not specified';
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    }

    // Generate ICS file content
    function generateIcsContent(events) {
      let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//IntranetCalendarSync//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH'
      ];

        events.forEach(function(event, index) {
          if (!event.startTime || !event.endTime) return;

          // Generate unique ID using event details for consistency
          const eventUid = `intranet-${event.group}-${event.course}-${event.startTime}`.replace(/[^a-zA-Z0-9-]/g, '-');

          // Format dates for ICS
          const startDateTime = formatDateForIcs(new Date(event.startTime));
          const endDateTime = formatDateForIcs(new Date(event.endTime));

          // Create event description
          const description = `Activity: ${event.activity || 'N/A'}
Group: ${event.group}
Room: ${event.room}
Generated by Intranet Calendar Sync`;

          // Add event to ICS
          icsContent.push(
            'BEGIN:VEVENT',
            'UID:' + eventUid,
            'DTSTAMP:' + formatDateForIcs(new Date()),
            'DTSTART:' + startDateTime,
            'DTEND:' + endDateTime,
            'SUMMARY:' + `${event.group} - ${event.course}`,
            'LOCATION:' + `Room ${event.room}`,
            'DESCRIPTION:' + description.replace(/\n/g, '\\n'),
            'END:VEVENT'
          );
      });

      icsContent.push('END:VCALENDAR');

      return icsContent.join('\r\n');
    }

    // Format date for ICS file
    function formatDateForIcs(date) {
      return date.getUTCFullYear() +
             padZero(date.getUTCMonth() + 1) +
             padZero(date.getUTCDate()) +
             'T' +
             padZero(date.getUTCHours()) +
             padZero(date.getUTCMinutes()) +
             padZero(date.getUTCSeconds()) +
             'Z';
    }

    // Add leading zero to single-digit numbers
    function padZero(num) {
      return (num < 10 ? '0' : '') + num;
    }

    // UI Helper functions
    function enableButtons() {
      exportIcsButton.disabled = false;
      syncGoogleCalButton.disabled = false;
    }

    function disableButtons() {
      exportIcsButton.disabled = true;
      syncGoogleCalButton.disabled = true;
    }

    function showStatus(message, type) {
      statusElement.textContent = message;
      statusElement.className = 'status ' + type;
      statusElement.style.display = 'block';
    }

    function clearStatus() {
      statusElement.style.display = 'none';
    }

    function showLoader() {
      loaderElement.style.display = 'block';
    }

    function hideLoader() {
      loaderElement.style.display = 'none';
    }
  });
