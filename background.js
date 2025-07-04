// Initialize Google API
let googleAuthToken = null;

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'syncWithGoogleCalendar') {
    syncWithGoogleCalendar(request.events)
      .then(result => {
        sendResponse({success: true, result: result});
      })
      .catch(error => {
        console.error('Error syncing with Google Calendar:', error);
        let errorMessage = '';
        if (error.response) {
          errorMessage = `API Error: ${error.response.status} - ${error.response.statusText}`;
        } else if (error.message) {
          errorMessage = error.message;
        } else {
          errorMessage = error.toString();
        }
        sendResponse({success: false, error: errorMessage});
      });
    return true;  // Required for async response
  }
});

// Function to authenticate with Google
async function authenticateWithGoogle() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({interactive: true}, function(token) {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError.message || 'Authentication failed';
        reject(new Error(`Google authentication failed: ${error}`));
        return;
      }

      if (token) {
        googleAuthToken = token;
        resolve(token);
      } else {
        reject(new Error('Failed to get auth token - no token returned'));
      }
    });
  });
}

// Function to sync events with Google Calendar
async function syncWithGoogleCalendar(events) {
  try {
    // Get auth token if we don't have one
    if (!googleAuthToken) {
      await authenticateWithGoogle();
    }

    // Find or create a calendar for these events
    const calendarId = await findOrCreateCalendar('Intranet Events');

    // Batch create events
    const results = await batchCreateEvents(calendarId, events);

    return {
      calendarId: calendarId,
      createdEvents: results.successCount,
      failedEvents: results.failureCount,
      skippedEvents: results.skippedCount,
      totalAttempted: results.totalAttempted,
      details: {
        successful: results.successful,
        failed: results.failed,
        skipped: results.skipped
      }
    };
  } catch (error) {
    console.error('Error in syncWithGoogleCalendar:', error);
    if (error.message) {
      throw new Error(error.message);
    }
    throw new Error('Failed to sync with Google Calendar');
  }
}

// Function to find or create a calendar
async function findOrCreateCalendar(calendarName) {
  try {
    // First try to find an existing calendar
    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: {
        'Authorization': 'Bearer ' + googleAuthToken
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to fetch calendars: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    if (!data.items) {
      throw new Error('Invalid calendar list response');
    }

    // Look for our calendar
    const calendar = data.items.find(cal => cal.summary === calendarName);

    if (calendar) {
      return calendar.id;
    }

    // If not found, create a new calendar
    const createResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + googleAuthToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: calendarName,
        description: 'Calendar for intranet events imported via Intranet Calendar Sync extension',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      })
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      throw new Error(`Failed to create calendar: ${errorData.error?.message || 'Unknown error'}`);
    }

    const newCalendar = await createResponse.json();
    if (!newCalendar.id) {
      throw new Error('Failed to get calendar ID from response');
    }
    return newCalendar.id;
  } catch (error) {
    console.error('Error finding/creating calendar:', error);
    throw error;
  }
}

// Function to find duplicate events in Google Calendar
async function findDuplicateEvent(calendarId, event) {
  try {
    const summary = `${event.group}`;

    // Set time window to search (1 minute before and after)
    const timeMin = new Date(event.startTime);
    const timeMax = new Date(event.endTime);

    // Query for events in the time window
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?` +
      `timeMin=${timeMin.toISOString()}&` +
      `timeMax=${timeMax.toISOString()}&` +
      `q=${encodeURIComponent(summary)}`, {
      headers: {
        'Authorization': 'Bearer ' + googleAuthToken
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to search events: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();

    // Check if any of the events match our criteria
    return data.items?.some(existingEvent =>
      existingEvent.summary === summary &&
      existingEvent.location === `Room ${event.room}` &&
      new Date(existingEvent.start.dateTime).getTime() === new Date(event.startTime).getTime() &&
      new Date(existingEvent.end.dateTime).getTime() === new Date(event.endTime).getTime()
    ) || false;
  } catch (error) {
    console.error('Error checking for duplicate event:', error);
    // If there's an error checking, we'll assume no duplicate to be safe
    return false;
  }
}

// Function to batch create events in Google Calendar
async function batchCreateEvents(calendarId, events) {
  const results = [];

  // Process events in batches (could implement actual batch API if needed)
  for (const event of events) {
    try {
      if (!event.startTime || !event.endTime) {
        console.warn('Skipping event due to missing start/end time:', event);
        continue;
      }

      const summary = `${event.group}`;
      const description = `Activity: ${event.activity}
Group: ${event.group}
Room: ${event.room}
Capacity: ${event.capacity}

Generated by Intranet Calendar Sync`;

      const calendarEvent = {
        summary: summary,
        location: `Room ${event.room}`,
        description: description,
        start: {
          dateTime: event.startTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: event.endTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        // Add color based on event type (you can customize these)
        colorId: getEventColorId(event.originalGroup || event.group)
      };

      // Check for duplicate before creating
      const isDuplicate = await findDuplicateEvent(calendarId, event);
      if (isDuplicate) {
        console.log('Skipping duplicate event:', summary);
        results.push({
          skipped: true,
          event: event,
          reason: 'Duplicate event found'
        });
        continue;
      }

      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + googleAuthToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(calendarEvent)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to create event: ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      if (!result.id) {
        throw new Error('Failed to get event ID from response');
      }
      results.push(result);
    } catch (error) {
      console.error('Error creating event:', error, 'Event data:', event);
      // Track failed events in the results
      results.push({
        error: error.message,
        failedEvent: event
      });
    }
  }

  // Include success/failure/skip stats in the return value
  const successfulEvents = results.filter(r => !r.error && !r.skipped);
  const failedEvents = results.filter(r => r.error);
  const skippedEvents = results.filter(r => r.skipped);

  return {
    successful: successfulEvents,
    failed: failedEvents,
    totalAttempted: events.length,
    successCount: successfulEvents.length,
    failureCount: failedEvents.length,
    skippedCount: skippedEvents.length
  };
}

// Function to determine color based on group
function getEventColorId(group) {
  // Google Calendar color IDs (1-11):
  // 1: Lavender, 2: Sage, 3: Grape, 4: Flamingo, 5: Banana
  // 6: Tangerine, 7: Peacock, 8: Graphite, 9: Blueberry, 10: Basil, 11: Tomato

  if (!group) return '1'; // Default to Lavender

  // Extract group number from format like "G0", "G1", etc.
  const groupNum = parseInt(group.replace('G', ''));

  // Use modulo to cycle through colors
  const colorId = (groupNum % 11) + 1;

  return colorId.toString();
}
