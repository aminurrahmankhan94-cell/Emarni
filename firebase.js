import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getDatabase, ref, set, get, push, onValue, update, remove } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBbvQfpdM7-WzbYrn2WfygvPS2iRVaEMHY",
  authDomain: "emarni-chat.firebaseapp.com",
  databaseURL: "https://emarni-chat-default-rtdb.firebaseio.com/",
  projectId: "emarni-chat",
  storageBucket: "emarni-chat.firebasestorage.app",
  messagingSenderId: "787575452024",
  appId: "1:787575452024:web:11fc477a865cb8b8b8588d"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, get, push, onValue, update, remove };
