import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const db = getFirestore(app);

const ownerUID = "DPHlnR2GSneI0PRPhTMqWapu04b2"; // 請填入你的完整 UID

async function checkAccess(user) {
  console.log("目前登入 UID：", user.uid);

  if (user.uid === ownerUID) {
    console.log("擁有者登入成功");
    showApp();
    return true;
  } else {
    console.log("非擁有者，UID 不符合 ownerUID。");
  }

  const ref = doc(db, "users", user.uid);
  const docSnap = await getDoc(ref);
  if (docSnap.exists() && docSnap.data().paid) {
    console.log("付費使用者，允許登入");
    showApp();
    return true;
  } else {
    alert("您尚未付費，無法使用本系統。");
    await signOut(auth);
    return false;
  }
}

async function showLoginUI() {
  const loginBtn = document.createElement("button");
  loginBtn.id = "loginBtn";
  loginBtn.innerText = "使用 Google 登入";
  loginBtn.style.fontSize = "1.2rem";
  loginBtn.style.marginTop = "3rem";
  document.body.innerHTML = "";
  document.body.appendChild(loginBtn);

  loginBtn.addEventListener("click", () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    signInWithPopup(auth, provider)
      .catch(error => {
        alert("登入失敗：" + error.message);
      });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("✅ onAuthStateChanged 收到登入使用者：", user);
      console.log("🟡 準備呼叫 checkAccess()");

      const ok = await checkAccess(user);
      console.log("✅ checkAccess 回傳結果：", ok);
      // 顯示控制已移至 showApp()，這裡不需再處理
    } else {
      console.log("🟠 使用者尚未登入，顯示登入畫面");
      await showLoginUI();
    }
  });

  const logoutBtn = document.createElement("button");
  logoutBtn.id = "logoutBtn";
  logoutBtn.innerText = "登出";
  logoutBtn.style.position = "fixed";
  logoutBtn.style.top = "10px";
  logoutBtn.style.right = "10px";
  logoutBtn.style.zIndex = 999;
  document.body.appendChild(logoutBtn);

  logoutBtn.addEventListener("click", () => {
    signOut(auth);
  });
});

function showApp() {
  const welcome = document.getElementById("welcome-screen");
  if (welcome) welcome.style.display = "none";
  const appMain = document.getElementById("app-main");
  if (appMain) appMain.style.display = "block";
}