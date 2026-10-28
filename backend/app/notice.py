"""Versioned consent notice (§13.2). The SHA-256 covers the exact displayed EN+HI text."""
import hashlib

NOTICE_VERSION = "2026-10-v1"

TEXT_EN = """**Before you talk — please read.**
Saar will transcribe **your own voice** during this call using Gnani AI's speech-to-text service, then create a short summary note using an AI language model (**DeepSeek**). The call audio is relayed by LiveKit. **Your voice audio is not saved.** The text transcript and note are kept on our server for up to **24 hours** so both of you can receive them, then deleted. Notes are also saved on each person's phone.
Everyone on the call must agree. You can **stop at any time** with the Revoke button, which stops transcription for everyone. This is a prototype: use it only for test or consenting conversations.
I agree to the transcription and summary described above."""

TEXT_HI = """**बात शुरू करने से पहले, कृपया पढ़ें।** Saar इस कॉल में **आपकी अपनी आवाज़** को Gnani AI की स्पीच-टू-टेक्स्ट सेवा से टेक्स्ट में बदलेगा और फिर AI भाषा मॉडल (DeepSeek) से एक छोटा सारांश नोट बनाएगा। कॉल की आवाज़ LiveKit के ज़रिये पहुँचाई जाती है। **आपकी आवाज़ की रिकॉर्डिंग सेव नहीं की जाती।** टेक्स्ट और नोट हमारे सर्वर पर अधिकतम **24 घंटे** रखे जाते हैं ताकि दोनों को मिल सकें, फिर हटा दिए जाते हैं। नोट हर व्यक्ति के फ़ोन में भी सेव होते हैं। कॉल पर सभी की सहमति ज़रूरी है। आप **कभी भी रोक सकते हैं**; रोकने पर सभी के लिए ट्रांसक्रिप्शन बंद हो जाएगा।
मैं ऊपर बताए गए ट्रांसक्रिप्शन और सारांश के लिए सहमत हूँ।"""

SHA256 = hashlib.sha256((TEXT_EN + "\n" + TEXT_HI).encode()).hexdigest()


def notice_dict() -> dict[str, str]:
    return {"version": NOTICE_VERSION, "text_en": TEXT_EN, "text_hi": TEXT_HI, "sha256": SHA256}
