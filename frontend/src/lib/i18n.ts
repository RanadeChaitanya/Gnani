// UI strings: English + Hindi (consent and critical buttons must exist in Hindi — spec §11.5).
import { useSyncExternalStore } from "react";

export const strings = {
  en: {
    pleaseCheck: "Please check",
    heard: "heard",
    more: "More",
    joinCallWith: "Join a call with",
    consentShort: "Only your own voice is transcribed (by Gnani AI) — never recorded. Text stays 24 h on the server and on your phone. Either person can stop it any time.",
    tagline: "Talk. Get a clean note.",
    demo: "Prototype — use only test or consenting conversations.",
    start: "Start a call",
    join: "Join a call",
    solo: "Try it alone (one phone)",
    notes: "Notes",
    privacy: "Privacy",
    name: "Your name",
    speak: "I'll speak in",




    moreOptions: "More options",
    notesIn: "Note language",
    notesEn: "English",
    notesSame: "Same as conversation",
    notesHi: "Hindi",
    bias: "Names or words to recognise",
    biasHint: "Single words, letters only, separated by spaces",
    code: "Call code",
    roomFull: "This call already has two people.",




    readNotice: "Read the full notice",
    agreeStart: "Agree & start call",
    agreeJoin: "Agree & join",
    agreeSolo: "Agree & start test",

    waitingFor: "Waiting for the other person",
    scanToJoin: "Ask them to scan this, or share the link",
    share: "Share link",
    copied: "Link copied",
    joining: "Connecting…",
    online: "On the call",
    away: "Not connected",
    hostStarts: "Starting as soon as both are in…",
    needConsent: "Transcription is stopped. Agree again to restart it.",
    agree: "I agree",
    disagree: "Not now",
    transcribing: "Transcribing",
    paused: "Not transcribing",
    mute: "Mute",
    unmute: "Unmute",
    quickNote: "Note now",
    revoke: "Stop",
    end: "End",
    micStalled: "Your mic stopped reaching Saar.",
    fixMic: "Fix mic",
    micSilent: "We can't hear you. Check the mic isn't blocked or covered, and speak a little closer.",
    earphones: "Tip: earphones give much better captions.",
    keepOpen: "Keep Saar open — transcription pauses while it's in the background.",
    speaking: "speaking…",
    noteMaking: "Writing your note…",
    noteSaved: "Note ready",
    open: "Open",
    insecure: "The microphone needs a secure (https) link. Open Saar from the https address.",
    micDenied: "Microphone permission was blocked. Allow it in your browser's site settings, then try again.",
    tapAudio: "Tap to hear the other person",
    search: "Search notes",
    noNotes: "No notes yet. Finish a call and its note appears here.",
    delete: "Delete",
    copy: "Copy",
    exportMd: "Markdown",
    shareNote: "Share",
    pdf: "PDF",
    csv: "Items CSV",
    note: "Note",
    transcript: "Transcript",
    unverified: "items could not be checked against what was said",
    summary: "Summary",






    saidInCall: "Total said on the call",



    decisions: "Agreed",
    actions: "To do",


    home: "Home",
    deleteServer: "Delete this conversation from the server now",
    debug: "Details",
    ended: "Call ended",
  },
  hi: {
    pleaseCheck: "कृपया जाँच लें",
    heard: "सुना गया",
    more: "और",
    joinCallWith: "कॉल से जुड़ें —",
    consentShort: "केवल आपकी अपनी आवाज़ (Gnani AI से) टेक्स्ट में बदली जाती है — रिकॉर्ड नहीं होती। टेक्स्ट 24 घंटे सर्वर पर और आपके फ़ोन में रहता है। कोई भी कभी भी रोक सकता है।",
    tagline: "बात करें। साफ़ नोट पाएँ।",
    demo: "प्रोटोटाइप — केवल टेस्ट या सहमति वाली बातचीत के लिए।",
    start: "कॉल शुरू करें",
    join: "कॉल से जुड़ें",
    solo: "अकेले आज़माएँ (एक फ़ोन)",
    notes: "नोट्स",
    privacy: "गोपनीयता",
    name: "आपका नाम",
    speak: "मैं बोलूँगा/बोलूँगी",




    moreOptions: "और विकल्प",
    notesIn: "नोट की भाषा",
    notesEn: "अंग्रेज़ी",
    notesSame: "बातचीत वाली भाषा",
    notesHi: "हिन्दी",
    bias: "पहचानने के लिए नाम या शब्द",
    biasHint: "एक-एक शब्द, केवल अक्षर, स्पेस से अलग",
    code: "कॉल कोड",
    roomFull: "इस कॉल में पहले से दो लोग हैं।",




    readNotice: "पूरी सूचना पढ़ें",
    agreeStart: "सहमत हूँ, कॉल शुरू करें",
    agreeJoin: "सहमत हूँ, जुड़ें",
    agreeSolo: "सहमत हूँ, टेस्ट शुरू करें",

    waitingFor: "दूसरे व्यक्ति का इंतज़ार",
    scanToJoin: "उनसे यह स्कैन करवाएँ, या लिंक भेजें",
    share: "लिंक भेजें",
    copied: "लिंक कॉपी हुआ",
    joining: "जुड़ रहे हैं…",
    online: "कॉल पर हैं",
    away: "जुड़े नहीं हैं",
    hostStarts: "दोनों के जुड़ते ही शुरू होगा…",
    needConsent: "ट्रांसक्रिप्शन रुका हुआ है। फिर से शुरू करने के लिए दोबारा सहमति दें।",
    agree: "मैं सहमत हूँ",
    disagree: "अभी नहीं",
    transcribing: "ट्रांसक्राइब हो रहा है",
    paused: "ट्रांसक्रिप्शन बंद",
    mute: "म्यूट",
    unmute: "अनम्यूट",
    quickNote: "अभी नोट",
    revoke: "रोकें",
    end: "खत्म",
    micStalled: "आपका माइक Saar तक नहीं पहुँच रहा।",
    fixMic: "माइक ठीक करें",
    micSilent: "आपकी आवाज़ नहीं आ रही। देखें कि माइक ब्लॉक या ढका न हो, और थोड़ा पास से बोलें।",
    earphones: "सुझाव: ईयरफ़ोन से कैप्शन काफ़ी बेहतर आते हैं।",
    keepOpen: "Saar खुला रखें — बैकग्राउंड में ट्रांसक्रिप्शन रुक जाता है।",
    speaking: "बोल रहे हैं…",
    noteMaking: "आपका नोट बन रहा है…",
    noteSaved: "नोट तैयार है",
    open: "खोलें",
    insecure: "माइक्रोफ़ोन के लिए सुरक्षित (https) लिंक चाहिए।",
    micDenied: "माइक्रोफ़ोन की अनुमति नहीं मिली। ब्राउज़र की साइट सेटिंग में अनुमति दें, फिर दोबारा कोशिश करें।",
    tapAudio: "दूसरे व्यक्ति को सुनने के लिए टैप करें",
    search: "नोट्स खोजें",
    noNotes: "अभी कोई नोट नहीं। कॉल खत्म करें, उसका नोट यहाँ दिखेगा।",
    delete: "हटाएँ",
    copy: "कॉपी",
    exportMd: "मार्कडाउन",
    shareNote: "शेयर",
    pdf: "PDF",
    csv: "सामान CSV",
    note: "नोट",
    transcript: "ट्रांसक्रिप्ट",
    unverified: "बातें बातचीत से मिलाई नहीं जा सकीं",
    summary: "सारांश",






    saidInCall: "कॉल में बताया गया कुल",



    decisions: "तय हुआ",
    actions: "करना है",


    home: "होम",
    deleteServer: "यह बातचीत अभी सर्वर से हटाएँ",
    debug: "विवरण",
    ended: "कॉल खत्म हुई",
  },
} as const;

export type Lang = keyof typeof strings;
export type Key = keyof (typeof strings)["en"];

let lang: Lang = (globalThis.localStorage?.getItem("saar:lang") as Lang) || "en";
const subs = new Set<() => void>();

export function setLang(l: Lang): void {
  lang = l;
  localStorage.setItem("saar:lang", l);
  document.documentElement.lang = l;
  subs.forEach((f) => f());
}

export function useT(): { t: (k: Key) => string; lang: Lang } {
  const l = useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => lang,
  );
  return { t: (k) => strings[l][k], lang: l };
}
