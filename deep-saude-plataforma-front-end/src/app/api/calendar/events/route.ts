import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next"
import { google } from 'googleapis';

export async function POST(req: Request) {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Adjust this based on how your session is structured to get the access token
  const accessToken = (session as any).accessToken;

  if (!accessToken) {
    return NextResponse.json({ error: 'Access token not found in session' }, { status: 400 });
  }

  try {
    const { summary, description, start, end } = await req.json();

    // Basic validation for event data
    if (!summary || !start || !end) {
      return NextResponse.json({ error: 'Missing required event details: summary, start, or end' }, { status: 400 });
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
      summary: summary,
      description: description,
      start: {
        dateTime: start,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, // Use browser's time zone or set explicitly
      },
      end: {
        dateTime: end,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, // Use browser's time zone or set explicitly
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    return NextResponse.json({ event: response.data }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating calendar event:', error);
    return NextResponse.json({ error: 'Failed to create calendar event', details: error.message }, { status: 500 });
  }
}