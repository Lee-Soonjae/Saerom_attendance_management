import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// .env에 실제 키가 들어오기 전까지는 Firebase를 켜지 않는다 — 그동안 앱은 로컬 데이터로 동작.
export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

export let db: Firestore | null = null

if (firebaseEnabled) {
  const app = initializeApp(firebaseConfig)

  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
  if (recaptchaSiteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  } else {
    console.warn('[firebase] VITE_RECAPTCHA_SITE_KEY가 없어 App Check 없이 실행됩니다.')
  }

  db = getFirestore(app)
} else {
  console.info('[firebase] .env에 Firebase 설정이 없어 로컬 데이터로 실행됩니다.')
}
