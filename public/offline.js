// The offline page in the language chosen in the app (the app keeps it in localStorage "language"). English is in the
// page itself; a language missing here stays English. Names, like Clozest, stay as they are.
;(function () {
  var TEXTS = {
    hi: {
      title: 'आप ऑफ़लाइन हैं · Clozest',
      heading: 'आप ऑफ़लाइन हैं',
      body: 'सैलून और आपकी बुकिंग दिखाने के लिए Clozest को इंटरनेट चाहिए। अपना इंटरनेट देखें, फिर कोशिश करें।',
      retry: 'फिर कोशिश करें',
    },
    te: {
      title: 'మీరు ఆఫ్‌లైన్‌లో ఉన్నారు · Clozest',
      heading: 'మీరు ఆఫ్‌లైన్‌లో ఉన్నారు',
      body: 'సెలూన్‌లు, మీ బుకింగ్‌లు చూపించడానికి Clozest కి ఇంటర్నెట్ కావాలి. మీ ఇంటర్నెట్ చూసి, మళ్లీ ప్రయత్నించండి.',
      retry: 'మళ్లీ ప్రయత్నించండి',
    },
    mr: {
      title: 'तुम्ही ऑफलाइन आहात · Clozest',
      heading: 'तुम्ही ऑफलाइन आहात',
      body: 'सलून आणि तुमचे बुकिंग दाखवण्यासाठी Clozest ला इंटरनेट लागते. तुमचे इंटरनेट तपासा, मग पुन्हा प्रयत्न करा.',
      retry: 'पुन्हा प्रयत्न करा',
    },
    ta: {
      title: 'நீங்கள் ஆஃப்லைனில் இருக்கிறீர்கள் · Clozest',
      heading: 'நீங்கள் ஆஃப்லைனில் இருக்கிறீர்கள்',
      body: 'சலூன்களையும் உங்கள் புக்கிங்குகளையும் காட்ட Clozest-க்கு இன்டர்நெட் வேண்டும். உங்கள் இன்டர்நெட்டைப் பார்த்துவிட்டு மீண்டும் முயலுங்கள்.',
      retry: 'மீண்டும் முயலுங்கள்',
    },
    kn: {
      title: 'ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ · Clozest',
      heading: 'ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ',
      body: 'ಸಲೂನ್‌ಗಳು ಮತ್ತು ನಿಮ್ಮ ಬುಕಿಂಗ್‌ಗಳನ್ನು ತೋರಿಸಲು Clozest ಗೆ ಇಂಟರ್ನೆಟ್ ಬೇಕು. ನಿಮ್ಮ ಇಂಟರ್ನೆಟ್ ನೋಡಿ, ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
      retry: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
    },
  }
  var lang = null
  try {
    lang = window.localStorage.getItem('language')
  } catch (e) {
    return
  }
  var t = lang && Object.prototype.hasOwnProperty.call(TEXTS, lang) ? TEXTS[lang] : null
  if (!t) return
  document.documentElement.lang = lang
  document.title = t.title
  document.getElementById('offline-heading').textContent = t.heading
  document.getElementById('offline-body').textContent = t.body
  document.getElementById('offline-retry').textContent = t.retry
})()
