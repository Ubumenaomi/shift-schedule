import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase 設定
const firebaseConfig = {
  apiKey: "AIzaSyBRf0fMiCapuvgtYkuC42PdhphHrMAHwOk",
  authDomain: "shift-scheduler-1b507.firebaseapp.com",
  projectId: "shift-scheduler-1b507",
  storageBucket: "shift-scheduler-1b507.appspot.com",
  messagingSenderId: "744013714935",
  appId: "1:744013714935:web:6fa55583ac6d870c288af2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

window.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.createElement("button");
  loginBtn.id = "loginBtn";
  loginBtn.innerText = "使用 Google 登入";
  document.body.prepend(loginBtn);

  const logoutBtn = document.createElement("button");
  logoutBtn.id = "logoutBtn";
  logoutBtn.innerText = "登出";
  logoutBtn.style.display = "none";
  document.body.prepend(logoutBtn);

  loginBtn.addEventListener("click", () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
      .then(result => {
        console.log("登入成功：", result.user.displayName);
      })
      .catch(error => {
        console.error("登入失敗：", error.message);
      });
  });

  logoutBtn.addEventListener("click", () => {
    signOut(auth).then(() => {
      console.log("已登出");
    });
  });

  onAuthStateChanged(auth, user => {
    if (user) {
      loginBtn.style.display = "none";
      logoutBtn.style.display = "inline-block";
    } else {
      loginBtn.style.display = "inline-block";
      logoutBtn.style.display = "none";
    }
  });
});