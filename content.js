// Language mappings
const LANG = {
    en: {
        days: {
            'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 7
        }
    },
    fr: {
        days: {
            'Lun': 1, 'Mar': 2, 'Mer': 3, 'Jeu': 4, 'Ven': 5, 'Sam': 6, 'Dim': 7
        }
    }
};

function detectLanguage() {
    const pageContent = document.body.textContent;
    return pageContent.includes('Gérer les calendriers') ? 'fr' : 'en';
}

function detectViewType() {
    const calendar = document.querySelector('.calendar.planner');
    if (calendar) {
        if (calendar.classList.contains('daysview')) return 'daily';
        if (calendar.classList.contains('weeksview')) return 'monthly';
    }
    return 'unknown';
}

function parseDateFromText(dateText, viewType) {
    try {
        if (!dateText) return new Date();
        const lang = detectLanguage();
        const date = new Date();

        // Handle daily view format
        if (viewType === 'daily') {
            // Match patterns like "Mon 21/4" or "Lun 21/4"
            const dayMatch = dateText.match(/(?:[A-Za-z]{3})\s*(\d+)\/(\d+)/);
            if (dayMatch) {
                const [, day, month] = dayMatch;
                date.setDate(parseInt(day));
                date.setMonth(parseInt(month) - 1);
                return date;
            }
        }

        // Handle monthly view
        if (viewType === 'monthly') {
            const day = parseInt(dateText);
            if (!isNaN(day)) {
                date.setDate(day);
                return date;
            }
        }

        return date;
    } catch (e) {
        console.error("Date parsing error:", e);
        return new Date();
    }
}

function extractRegisteredEvents() {
    const viewType = detectViewType();
    const events = [];

    // Find events based on view type
    let eventElements;
    if (viewType === 'monthly') {
        // For monthly view, get certain types of events from the calendar grid
        eventElements = Array.from(document.querySelectorAll('.appoint.singleday'))
            .filter(el => {
                // Keep only certain types of events and ensure they're in the grid
                return el.closest('.appcont') && (
                    el.classList.contains('rdv') ||     // Appointments/Reviews
                    el.classList.contains('class') ||   // Classes
                    el.classList.contains('tp') ||      // Practical work
                    el.classList.contains('exam')       // Exams
                );
            });
    } else {
        // For daily/weekly view, use regular event detection
        eventElements = document.querySelectorAll('.event_registered');
    }

    // Get the current month view dates if in monthly view
    let monthDates = new Map();
    if (viewType === 'monthly') {
        document.querySelectorAll('.appoints thead .title a').forEach(link => {
            const day = link.textContent.trim();
            const href = link.getAttribute('href');
            if (href) {
                const dateMatch = href.match(/start=(\d{4}-\d{2}-\d{2})/);
                if (dateMatch) {
                    monthDates.set(day, new Date(dateMatch[1]));
                }
            }
        });
    }

    const currentDate = document.querySelector('.calendar.planner')?.textContent || '';
    console.debug('View info:', { viewType, monthDates });

    eventElements.forEach(element => {
        try {
            // Get the raw text content
            let eventText = element.textContent.trim();

            // Clean up the text:
            // 1. Remove extra text patterns in both French and English
            eventText = eventText
                .replace(/(?:Etudiants inscrits|Students registered|Students enrolled).*?(?=\d{2}:\d{2})/gs, '')
                .replace(/(?:Voir les créneaux|See slots).*?(?=\d{2}:\d{2})/gs, '')
                .replace(/(?:Plus d'options|More options).*?(?=\d{2}:\d{2})/gs, '')
                .replace(/(?:Vous avez été présent|You were present).*?(?=\d{2}:\d{2})/gs, '')
                .replace(/(?:View appointment slots).*?(?=\d{2}:\d{2})/gs, '');

            // Split into lines and clean each line
            const lines = eventText.split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .filter(line => !line.match(/^(?:More|Plus|View|Voir|You|Vous)/)); // Remove leftover option lines

            // Parse course info based on view type
            let group = '', course = '', activity = '';

            if (viewType === 'monthly') {
                // Monthly view:
                // - Title attribute has the full activity name: "Activity - Name, de HH:mm à HH:mm"
                // - P tag has the course part of the activity
                const titleAttr = element.getAttribute('title') || '';
                const pText = element.querySelector('p')?.textContent.trim() || '';

                // First try to get group and course from paragraph text
                if (pText.includes(' - ')) {
                    [group, course] = pText.split(' - ').map(s => s.trim());
                } else if (pText.match(/^G\d+/)) {
                    // If p text starts with group number
                    group = pText.match(/^(G\d+)/)[1];
                    course = pText.replace(/^G\d+\s*-?\s*/, '').trim();
                } else {
                    course = pText;
                }

                // Get activity from title (everything before the time info)
                const titleParts = titleAttr.split(/,\s*(?:de|from)/);
                activity = titleParts[0].replace(/^[^-]+-\s*/, '').trim();

                // If title contains a more detailed course name, update it
                const titleMain = titleParts[0].trim();
                if (titleMain.includes(course) && titleMain.length > course.length) {
                    const betterCourse = titleMain.split(/[-»]/).find(part =>
                        part.trim().includes(course)
                    )?.trim();
                    if (betterCourse) course = betterCourse;
                }

                if (activity.startsWith(course)) {
                    activity = activity.replace(course, '').replace(/^[-»\s]+/, '');
                }

                // Final attempt to find group
                if (!group) {
                    const groupMatch = eventText.match(/G\d+/) || titleAttr.match(/G\d+/);
                    group = groupMatch ? groupMatch[0] : '';
                }

                // Clean up any hanging punctuation
                course = course.replace(/[-»\s]+$/, '');
                activity = activity.replace(/[-»\s]+$/, '');
            } else {
                // Daily/weekly view parsing
                const courseInfo = lines[0] || '';
                const [groupAndCourse, activityText] = courseInfo.split('»').map(s => s.trim());
                // Split only at the first hyphen to preserve course names with hyphens
                const firstHyphenIndex = (groupAndCourse || '').indexOf('-');
                if (firstHyphenIndex !== -1) {
                    group = groupAndCourse.substring(0, firstHyphenIndex).trim();
                    course = groupAndCourse.substring(firstHyphenIndex + 1).trim();
                } else {
                    group = '';
                    course = groupAndCourse || '';
                }
                activity = activityText || '';
            }

            // Find room info using multiple patterns
            let roomMatch = null;
            let room = 'Unknown Room';

            if (viewType === 'monthly') {
                const titleAttr = element.getAttribute('title') || '';

                // Try different room patterns
                roomMatch =
                    // Room number in title: "Activity in 123"
                    titleAttr.match(/\b(?:salle|room)?\s*(\d{3})\b/i) ||
                    // Just the room number
                    titleAttr.match(/\b(\d{3})\b/);
            }

            // If not found in title, try the text content
            if (!roomMatch) {
                roomMatch = eventText.match(/\b(?:salle|room)?\s*(\d{3})\b/i);
            }

            // Last attempt - look for 3-digit number in specific lines
            if (!roomMatch) {
                const roomLine = lines.find(line => /\b\d{3}\b/.test(line));
                if (roomLine) {
                    roomMatch = roomLine.match(/\b(\d{3})\b/);
                }
            }

            if (roomMatch) {
                room = roomMatch[1];
            }

            // Find time info based on view type
            let startTime = '', endTime = '';

            if (viewType === 'monthly') {
                // Check title attribute first (format: "Activity, de HH:mm à HH:mm")
                const titleAttr = element.getAttribute('title') || '';
                // Handle both French and English formats:
                // French: "Activity, de 9h00 à 12h00" or "Activity, de 09:00 à 12:00"
                // English: "Activity, from 9:00 to 12:00"
                const frenchMatch = titleAttr.match(/de (\d{1,2})[h:](\d{2})(?: ?[à-] ?)(\d{1,2})[h:](\d{2})/);
                const englishMatch = titleAttr.match(/from (\d{1,2}):(\d{2}) to (\d{1,2}):(\d{2})/);
                const untilMatch = titleAttr.match(/(?:jusqu'à|until)\s+(\d{1,2})[h:](\d{2})/);

                if (frenchMatch) {
                    startTime = `${frenchMatch[1].padStart(2, '0')}:${frenchMatch[2]}`;
                    endTime = `${frenchMatch[4].padStart(2, '0')}:${frenchMatch[5]}`;
                } else if (englishMatch) {
                    startTime = `${englishMatch[1].padStart(2, '0')}:${englishMatch[2]}`;
                    endTime = `${englishMatch[3].padStart(2, '0')}:${englishMatch[4]}`;
                } else {
                    // Fallback to h4 element which contains the start time
                    const timeHeader = element.querySelector('h4')?.textContent.trim();
                    if (timeHeader) {
                        startTime = timeHeader.padStart(5, '0'); // Pad single-digit hours
                        if (untilMatch) {
                            endTime = `${untilMatch[1].padStart(2, '0')}:${untilMatch[2]}`;
                        }
                    }
                }
            }

            // If times not found or in daily view, try standard pattern
            if (!startTime || !endTime) {
                const timeLine = lines.find(line => /\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}/.test(line)) || '';
                const timeMatch = timeLine.match(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
                if (timeMatch) {
                    startTime = timeMatch[1];
                    endTime = timeMatch[2];
                }
            }

            // Get the event date based on view type
            let eventDate;
            if (viewType === 'monthly') {
                // Find the column (th) index of this event
                const cell = element.closest('td');
                if (cell) {
                    const columnIndex = Array.from(cell.parentElement.children).indexOf(cell);
                    const headerCell = element.closest('.appoints')
                        ?.querySelector(`thead th:nth-child(${columnIndex + 1}) .title a`);
                    if (headerCell) {
                        const dateHref = headerCell.getAttribute('href');
                        const dateMatch = dateHref?.match(/start=(\d{4}-\d{2}-\d{2})/);
                        if (dateMatch) {
                            eventDate = new Date(dateMatch[1]);
                        }
                    }
                }
            } else if (element.closest('.planning-week-day')) {
                const dayHeader = element.closest('.planning-week-day').querySelector('.day-header');
                eventDate = parseDateFromText(dayHeader?.textContent || currentDate, viewType);
            }

            if (!eventDate) {
                eventDate = parseDateFromText(currentDate, viewType);
            }

            // Create datetime objects
            let startDateTime = null;
            let endDateTime = null;

            if (startTime && endTime) {
                startDateTime = new Date(eventDate);
                const [startHours, startMinutes] = startTime.split(':').map(Number);
                startDateTime.setHours(startHours, startMinutes, 0);

                endDateTime = new Date(eventDate);
                const [endHours, endMinutes] = endTime.split(':').map(Number);
                endDateTime.setHours(endHours, endMinutes, 0);
            }

            // Debug log for event parsing
            console.debug('Event parsing:', {
                viewType,
                rawText: eventText,
                titleAttr: element.getAttribute('title'),
                group,
                course,
                activity,
                room,
                time: `${startTime} - ${endTime}`,
                date: eventDate
            });

            // Validate and create the event object
            if (group && course && startTime && endTime && room !== 'Unknown Room') {
                events.push({
                    group,
                    course,
                    activity,
                    room,
                    startTime: startDateTime ? startDateTime.toISOString() : null,
                    endTime: endDateTime ? endDateTime.toISOString() : null,
                    rawText: eventText, // Keep raw text for debugging
                    language: detectLanguage() // Add language info for debugging
                });
            }
        } catch (error) {
            console.error('Error processing event:', error);
            // Continue with other events even if one fails
        }
    });

    return events;
}

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getEvents') {
        const events = extractRegisteredEvents();
        sendResponse({events: events});
    }
    return true;  // Required for async response
});
