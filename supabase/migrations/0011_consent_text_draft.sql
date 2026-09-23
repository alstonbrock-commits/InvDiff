-- 0011: real consent wording (DRAFT — get legal/privacy sign-off before
-- public launch; v-final should replace this and bump the version).

update app_settings set
  consent_text = 'You are invited to take part in a short recorded interview about a workplace event, conducted using the Event Insight app by Investigations Differently.

Participation is voluntary. You may decline any question, pause, or stop the interview at any time, and you may ask for your recording to be withdrawn by contacting the interviewer.

Your answers will be audio-recorded and transcribed. Recordings and transcripts are processed by secure AI transcription and analysis services located outside Australia (United States). Your information is otherwise stored securely in Australia and used only to understand and improve how work is done. It is not used for disciplinary purposes.

Audio recordings are deleted after the review is finalised (within the organisation''s retention window); transcripts and de-identified findings are retained as part of the review record.

By signing below you confirm that you have read and understood this notice and agree to be recorded on these terms.',
  consent_text_version = 'v2-draft';
