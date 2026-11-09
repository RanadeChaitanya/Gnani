// UI strings: English + Hindi (consent and critical buttons must exist in Hindi — spec §11.5).
import { useSyncExternalStore } from "react";

export const strings = {
  en: {
    details: "Details",
    keyPoints: "Key points",
    notionPaste: "Copied. In the Notion page that opened, paste (Ctrl/⌘ V) — it keeps the headings and tables.",
    tilePhoneNotes: "Phone notes",
    tileNotionSave: "Save as a page",
    tileNotionPaste: "Copy & open",
    tileWhatsApp: "Send as message",
    tilePdf: "Print or save",
    language: "Language",
    autoLang: "Language: Auto",
    yourMobile: "Your mobile number",
    continue: "Continue",
    fromContacts: "Contacts",
    contactsBlocked: "Contacts are not available in this browser. Type the number instead.",
    typeNumber: "Mobile number",
    call: "Call",
    cancel: "Cancel",
    confirmed: "Confirmed",
    draft: "Draft",
    confirmedAll: "Confirmed by all participants",
    incoming: "Incoming Saar call",
    acceptJoin: "Accept",
    decline: "Decline",
    notNow: "Not now",
    callOver: "This call has already ended.",
    ringing: "Ringing…",
    notOnSaar: "Not on Saar. Send invite:",
    inviteText: "{name} is calling you on Saar (call notes, with your consent). Tap to join:",
    inviteOther: "Other",
    cancelCall: "Cancel",
    connecting: "Connecting…",
    theOtherPerson: "the other person",
    declinedTitle: "{name} declined the call",
    noNoteNothingSaid: "Nothing was said, so there is no note.",
    noteFailed: "The note could not be written.",
    rewriting: "Updating the note with the correction…",
    done: "Done",
    youConfirmed: "You confirmed this note",
    waitingOn: "Waiting for {names} to confirm…",
    yesCorrect: "Confirm",
    somethingWrong: "Fix",
    whatWrong: "What should change?",
    sendCorrection: "Send correction",
    noNoteYet: "No note was generated. The transcript is kept below.",
    purpose: "Purpose",
    outcome: "Outcome",
    orderDetails: "Order",
    item: "Item",
    whenWhere: "When and where",
    corrections: "Corrections by participants",
    saveShare: "Save or share",
    savedNotion: "Saved to Notion.",
    copiedPaste: "Copied. Paste it into your notes app.",
    noteMissing: "This note is not on this phone.",
    transcriptMore: "Transcript, Markdown file, delete",
    pleaseCheck: "To confirm",
    heard: "heard",
    more: "More",
    consentShort: "Your voice goes to Gnani AI and the text to DeepSeek. Either of you can stop.",
    soloShort: "Test",
    start: "Start a call",
    solo: "Try it alone (one phone)",
    notes: "Notes",
    records: "Records",
    recordsEmpty: "Each person you call gets a record here after your first call note.",
    calls: "Calls",
    lastCall: "Last call",
    spent: "Total value",
    itemsBought: "Items and rates",
    lastQty: "Last quantity",
    rate: "Rate",
    was: "was",
    openTasks: "Open from the last call",
    excelOne: "Download sheet (Excel)",
    excelAll: "Download all records (Excel)",
    waDraft: "WhatsApp message",
    msgLang: "Message language (detected from the call)",
    waNumber: "Their WhatsApp number",
    sendWa: "Send on WhatsApp",
    privacy: "Privacy",
    name: "Your name",




    roomFull: "This call already has two people.",





    waitingFor: "Waiting for the other person",
    copied: "Link copied",
    joining: "Connecting…",
    online: "On the call",
    away: "Not connected",
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
    keepOpen: "Keep Saar open — transcription pauses while it's in the background.",
    speaking: "speaking…",
    noteMaking: "Saar is writing the note…",
    noteSaved: "Note ready",
    open: "Open",
    insecure: "The microphone needs a secure (https) link. Open Saar from the https address.",
    micDenied: "Microphone permission was blocked. Allow it in your browser's site settings, then try again.",
    tapAudio: "Tap to hear the other person",
    search: "Search notes",
    noNotes: "No notes yet. Finish a call and its note appears here.",
    delete: "Delete",
    exportMd: "Markdown",
    transcript: "Transcript",






    saidInCall: "Total said on the call",



    decisions: "Agreed",
    actions: "To do",


    home: "Home",
    debug: "Details",
    ended: "Call ended",
  },
  hi: {
    details: "विवरण",
    keyPoints: "मुख्य बातें",
    notionPaste: "कॉपी हो गया। खुले Notion पेज में पेस्ट करें — हेडिंग और टेबल बने रहेंगे।",
    tilePhoneNotes: "फ़ोन नोट्स",
    tileNotionSave: "पेज के रूप में सेव",
    tileNotionPaste: "कॉपी करें और खोलें",
    tileWhatsApp: "मैसेज भेजें",
    tilePdf: "प्रिंट या सेव",
    language: "भाषा",
    autoLang: "भाषा: ऑटो",
    yourMobile: "आपका मोबाइल नंबर",
    continue: "आगे बढ़ें",
    fromContacts: "संपर्क",
    contactsBlocked: "इस ब्राउज़र में संपर्क उपलब्ध नहीं हैं। नंबर टाइप करें।",
    typeNumber: "मोबाइल नंबर",
    call: "कॉल",
    cancel: "रद्द करें",
    confirmed: "पुष्ट",
    draft: "ड्राफ़्ट",
    confirmedAll: "सभी प्रतिभागियों द्वारा पुष्ट",
    incoming: "आने वाली Saar कॉल",
    acceptJoin: "स्वीकार करें",
    decline: "अस्वीकार करें",
    notNow: "अभी नहीं",
    callOver: "यह कॉल पहले ही खत्म हो चुकी है।",
    ringing: "घंटी बज रही है…",
    notOnSaar: "Saar पर नहीं हैं। निमंत्रण भेजें:",
    inviteText: "{name} आपको Saar पर कॉल कर रहे हैं (आपकी सहमति से कॉल नोट्स)। जुड़ने के लिए टैप करें:",
    inviteOther: "अन्य",
    cancelCall: "रद्द करें",
    connecting: "कनेक्ट हो रहा है…",
    theOtherPerson: "दूसरा व्यक्ति",
    declinedTitle: "{name} ने कॉल अस्वीकार की",
    noNoteNothingSaid: "कुछ बोला नहीं गया, इसलिए कोई नोट नहीं है।",
    noteFailed: "नोट नहीं बन सका।",
    rewriting: "सुधार के साथ नोट अपडेट हो रहा है…",
    done: "हो गया",
    youConfirmed: "आपने इस नोट की पुष्टि की",
    waitingOn: "{names} की पुष्टि का इंतज़ार…",
    yesCorrect: "पुष्टि करें",
    somethingWrong: "सुधारें",
    whatWrong: "क्या बदलना चाहिए?",
    sendCorrection: "सुधार भेजें",
    noNoteYet: "कोई नोट नहीं बना। ट्रांसक्रिप्ट नीचे है।",
    purpose: "उद्देश्य",
    outcome: "परिणाम",
    orderDetails: "ऑर्डर",
    item: "वस्तु",
    whenWhere: "कब और कहाँ",
    corrections: "प्रतिभागियों के सुधार",
    saveShare: "सेव या साझा करें",
    savedNotion: "Notion में सेव हो गया।",
    copiedPaste: "कॉपी हो गया। इसे अपने नोट्स ऐप में पेस्ट करें।",
    noteMissing: "यह नोट इस फ़ोन पर नहीं है।",
    transcriptMore: "ट्रांसक्रिप्ट, Markdown फ़ाइल, हटाएँ",
    pleaseCheck: "पुष्टि करें",
    heard: "सुना गया",
    more: "और",
    consentShort: "आपकी आवाज़ Gnani AI को और टेक्स्ट DeepSeek को जाता है। कोई भी रोक सकता है।",
    soloShort: "टेस्ट",
    start: "कॉल शुरू करें",
    solo: "अकेले आज़माएँ (एक फ़ोन)",
    notes: "नोट्स",
    records: "रिकॉर्ड",
    recordsEmpty: "पहली कॉल के नोट के बाद हर व्यक्ति का रिकॉर्ड यहाँ बनेगा।",
    calls: "कॉल",
    lastCall: "पिछली कॉल",
    spent: "कुल राशि",
    itemsBought: "सामान और रेट",
    lastQty: "पिछली मात्रा",
    rate: "रेट",
    was: "पहले",
    openTasks: "पिछली कॉल से बाकी",
    excelOne: "शीट डाउनलोड करें (Excel)",
    excelAll: "सारे रिकॉर्ड डाउनलोड करें (Excel)",
    waDraft: "WhatsApp संदेश",
    msgLang: "संदेश की भाषा (कॉल से पहचानी गई)",
    waNumber: "उनका WhatsApp नंबर",
    sendWa: "WhatsApp पर भेजें",
    privacy: "गोपनीयता",
    name: "आपका नाम",




    roomFull: "इस कॉल में पहले से दो लोग हैं।",





    waitingFor: "दूसरे व्यक्ति का इंतज़ार",
    copied: "लिंक कॉपी हुआ",
    joining: "जुड़ रहे हैं…",
    online: "कॉल पर हैं",
    away: "जुड़े नहीं हैं",
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
    keepOpen: "Saar खुला रखें — बैकग्राउंड में ट्रांसक्रिप्शन रुक जाता है।",
    speaking: "बोल रहे हैं…",
    noteMaking: "Saar नोट लिख रहा है…",
    noteSaved: "नोट तैयार है",
    open: "खोलें",
    insecure: "माइक्रोफ़ोन के लिए सुरक्षित (https) लिंक चाहिए।",
    micDenied: "माइक्रोफ़ोन की अनुमति नहीं मिली। ब्राउज़र की साइट सेटिंग में अनुमति दें, फिर दोबारा कोशिश करें।",
    tapAudio: "दूसरे व्यक्ति को सुनने के लिए टैप करें",
    search: "नोट्स खोजें",
    noNotes: "अभी कोई नोट नहीं। कॉल खत्म करें, उसका नोट यहाँ दिखेगा।",
    delete: "हटाएँ",
    exportMd: "मार्कडाउन",
    transcript: "ट्रांसक्रिप्ट",






    saidInCall: "कॉल में बताया गया कुल",



    decisions: "तय हुआ",
    actions: "करना है",


    home: "होम",
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
