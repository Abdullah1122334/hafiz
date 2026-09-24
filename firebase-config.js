// ============================================================================
//  إعدادات المزامنة (Firebase)  —  Sync settings
// ----------------------------------------------------------------------------
//  الصق هنا الإعدادات اللي بتاخدها من Firebase Console
//  (Project settings → Your apps → Web app → SDK setup and configuration → Config)
//  بعد ما تحطها هنا، كل الأجهزة (الكمبيوتر والموبايل) هتتزامن تلقائياً.
//
//  Paste the config object from the Firebase console here. These values are
//  public identifiers, not secrets: your data is protected by your master
//  password (end-to-end encryption) and by firestore.rules.
//
//  لو سبتها فاضية، التطبيق هيشتغل على الجهاز ده بس (من غير مزامنة)،
//  وتقدر كمان تلصق الإعدادات من جوه التطبيق.
// ============================================================================

export const firebaseConfig = {
  apiKey: 'AIzaSyD8pV0jREIbTDJa-p3KggueoBOS95iDPqw',
  authDomain: 'hafiz-db9a3.firebaseapp.com',
  projectId: 'hafiz-db9a3',
  storageBucket: 'hafiz-db9a3.firebasestorage.app',
  messagingSenderId: '1076697854497',
  appId: '1:1076697854497:web:1b7ce03329b798d029e960',
  // The Firestore database in this project was created with the ID "default".
  // (Leave this out for projects whose database is the usual "(default)".)
  databaseId: 'default',
};
