# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Tourists and local people in general, talking face to face while travelling: at a shop counter, a hotel desk, a station, on the street. One side often hosts the conversation on a tablet or phone (for example shop or hotel staff, whose UI is Japanese); the other joins from their own phone by scanning a QR code. Most participants are first-time users with no explanation and no app install, often standing, in a hurry, in noisy places.

## Product Purpose

Lingo lets two to six people who share no language hold a natural spoken conversation, each on their own device, each reading and hearing the others in their own language. Success: the conversation flows like a normal back-and-forth, without passing one phone around and without anyone needing instructions.

## Positioning

- **Everyone on their own phone, at the same time.** Guests join by QR in the browser (no install, up to 6 people); each person sees text and hears voice in their own language.
- **Voice that keeps how it was said.** Emotion is estimated from the voice, and translations can be spoken in a voice close to the speaker's, with that emotion.
- **Low latency.** Translation starts streaming while the person is still talking; the target is about 0.5 s behind speech.

## Operating Context

- Staff/host opens a room (passcode-protected), shows the QR code; guests scan and join in the browser.
- Two talk modes: tap-to-talk (default; mic opens per turn and closes by itself after a pause, so playback stays loud on iPhone) and hands-free (always listening, best with earphones). Typing and photo explanation are also available.
- Phones are held at arm's length or shown to the other person; screens are read at a glance in daylight and noise.
- A take-home summary can be generated at the end.

## Capabilities and Constraints

- Hackathon project on Google Cloud: Gemini is used only through Vertex AI (live translation, analysis, TTS); deployed publicly on Cloud Run.
- Live speech translation with streamed captions and audio; a second-pass transcription of each finished turn improves accuracy; typed text and photos are translated too.
- Conversation flow: replies and corrections are linked to the message they answer.
- Critical facts (price, allergy, medicine, safety) can be back-translated for the speaker to confirm.
- Existing consent copy states: audio is not recorded, and conversation text is deleted when the conversation ends. Future work must keep this true.
- UI languages: Japanese, English, Chinese, Korean, Spanish, Thai (others fall back to English); conversation languages are broader.
- Undecided: native app, offline use, accounts/history beyond one conversation.

## Brand Commitments

- Name: "lingo" (lowercase wordmark).
- Hand-drawn sketch illustrations with captions cycling through many languages ("Speak your language") explain usage; they came from the team's own drawing and video.

## Evidence on Hand

- Family usability test feedback (real users struggled with mic start/stop timing, turn boundaries, volume on iPhone, cramped phone layout) drove the current design.
- No real customer testimonials, metrics, or pilot deployments exist yet; do not fabricate any.

## Product Principles

1. **Easy to use above all.** A first-time user must succeed without reading instructions; every state (whose turn, listening, sending, playing) is visible at a glance.
2. **The conversation, not the tool.** The newest line is what matters most; history and settings stay secondary.
3. **Each person in their own language.** Every screen a guest sees speaks their language, with pictures where words fail.
4. **Fast and faithful.** Show and play the translation as soon as possible, and fix it when a better version arrives, without hiding that it changed.
