'use server';

/**
 * @fileOverview This file defines a Genkit flow for analyzing session notes and suggesting relevant keywords,
 * themes, and potential insights for therapists.
 *
 * - getSessionNoteInsights - A function that triggers the session note analysis process.
 * - SessionNoteInsightsInput - The input type for the getSessionNoteInsights function.
 * - SessionNoteInsightsOutput - The return type for the getSessionNoteInsights function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SessionNoteInsightsInputSchema = z.object({
  sessionNotes: z
    .string()
    .describe('The session notes to be analyzed.'),
});

export type SessionNoteInsightsInput = z.infer<typeof SessionNoteInsightsInputSchema>;

const SessionNoteInsightsOutputSchema = z.object({
  keywords: z.array(z.string()).describe('Relevant keywords found in the session notes.'),
  themes: z.array(z.string()).describe('Major themes identified in the session notes.'),
  insights: z
    .array(z.string())
    .describe('Potential insights derived from the session notes.'),
});

export type SessionNoteInsightsOutput = z.infer<typeof SessionNoteInsightsOutputSchema>;

export async function getSessionNoteInsights(input: SessionNoteInsightsInput): Promise<SessionNoteInsightsOutput> {
  return sessionNoteInsightsFlow(input);
}

const sessionNoteInsightsPrompt = ai.definePrompt({
  name: 'sessionNoteInsightsPrompt',
  input: {schema: SessionNoteInsightsInputSchema},
  output: {schema: SessionNoteInsightsOutputSchema},
  prompt: `You are an AI assistant designed to help therapists analyze their session notes.
  Given the session notes, identify relevant keywords, major themes, and potential insights that could help the therapist understand the patient's progress.

  Session Notes:
  {{sessionNotes}}

  Please provide the keywords, themes, and insights in the following JSON format:
  { 
    "keywords": ["keyword1", "keyword2", ...],
    "themes": ["theme1", "theme2", ...],
    "insights": ["insight1", "insight2", ...]
  }
  Ensure that the keywords, themes and insights are relevant to the notes provided.
  Do not include any additional information besides the JSON output.
  `,
});

const sessionNoteInsightsFlow = ai.defineFlow(
  {
    name: 'sessionNoteInsightsFlow',
    inputSchema: SessionNoteInsightsInputSchema,
    outputSchema: SessionNoteInsightsOutputSchema,
  },
  async input => {
    const {output} = await sessionNoteInsightsPrompt(input);
    return output!;
  }
);
