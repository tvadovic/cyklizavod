// Úložisko hier. Dve implementácie s rovnakým rozhraním:
//   LocalStore – localStorage v tomto zariadení (bez účtu, funguje vždy),
//   CloudStore – Firestore (prihlásenie cez Google, synchronizácia, offline režim).
//
// Hra v úložisku: { id, name, ownerUid, members, createdAt, updatedAt, status,
//                   teams, stages, teamOrder, events, summary }
// Udalosti sa pridávajú/odoberajú po jednej, takže dve zariadenia si neprepíšu zápisy.

import { firebaseConfig, FIREBASE_VERSION } from './firebase-config.js';

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => Date.now();

// ---------- Lokálne úložisko ----------

const KEY = 'cz2:game:';
const STAGES_KEY = 'cz2:customStages';

export class LocalStore {
  constructor() {
    this.kind = 'local';
    this.user = null;
    this.listeners = new Map();
    window.addEventListener('storage', (e) => {
      if (e.key?.startsWith(KEY)) this.emit(e.key.slice(KEY.length));
    });
    navigator.storage?.persist?.().catch(() => {});
  }
  read(id) {
    try { return JSON.parse(localStorage.getItem(KEY + id)); } catch { return null; }
  }
  write(game) {
    localStorage.setItem(KEY + game.id, JSON.stringify(game));
    this.emit(game.id);
  }
  emit(id) {
    for (const cb of this.listeners.get(id) || []) cb(this.read(id));
    for (const cb of this.listeners.get('*') || []) this.listGames().then(cb);
  }
  async listGames() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(KEY)) { const g = this.read(k.slice(KEY.length)); if (g) out.push(g); }
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  watchGames(cb) {
    if (!this.listeners.has('*')) this.listeners.set('*', new Set());
    this.listeners.get('*').add(cb);
    this.listGames().then(cb);
    return () => this.listeners.get('*')?.delete(cb);
  }
  watchGame(id, cb) {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id).add(cb);
    cb(this.read(id));
    return () => this.listeners.get(id)?.delete(cb);
  }
  async createGame(game) {
    const g = { ...game, id: game.id || newId(), createdAt: game.createdAt || now(), updatedAt: now(), events: game.events || [] };
    this.write(g);
    return g.id;
  }
  async updateGame(id, patch) {
    const g = this.read(id); if (!g) return;
    this.write({ ...g, ...patch, updatedAt: now() });
  }
  async addEvent(id, ev) {
    const g = this.read(id); if (!g) return;
    g.events.push(ev); g.updatedAt = now(); this.write(g);
  }
  async removeEvent(id, ev) {
    const g = this.read(id); if (!g) return;
    g.events = g.events.filter((e) => e.id !== ev.id); g.updatedAt = now(); this.write(g);
  }
  async deleteGame(id) {
    localStorage.removeItem(KEY + id); this.emit(id);
  }
  async getCustomStages() {
    try { return JSON.parse(localStorage.getItem(STAGES_KEY)) || []; } catch { return []; }
  }
  async saveCustomStages(list) {
    localStorage.setItem(STAGES_KEY, JSON.stringify(list));
  }
}

// ---------- Firestore ----------

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

export class CloudStore {
  static get configured() { return !!firebaseConfig; }

  async init(onUser) {
    const [app, auth, fs] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-firestore.js`),
    ]);
    this.kind = 'cloud';
    this.a = auth; this.f = fs;
    const fbApp = app.initializeApp(firebaseConfig);
    this.auth = auth.getAuth(fbApp);
    this.auth.languageCode = 'sk';
    this.db = fs.initializeFirestore(fbApp, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
    auth.getRedirectResult(this.auth).catch(() => {});
    auth.onAuthStateChanged(this.auth, (u) => {
      this.user = u ? { uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL } : null;
      onUser(this.user);
    });
  }

  async signIn() {
    const provider = new this.a.GoogleAuthProvider();
    try {
      await this.a.signInWithPopup(this.auth, provider);
    } catch (e) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
        await this.a.signInWithRedirect(this.auth, provider);
      } else if (e.code !== 'auth/popup-closed-by-user') throw e;
    }
  }
  signOut() { return this.a.signOut(this.auth); }

  ref(id) { return this.f.doc(this.db, 'games', id); }

  async listGames() {
    const { collection, query, where, getDocs } = this.f;
    const q = query(collection(this.db, 'games'), where('members', 'array-contains', this.user.uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  watchGames(cb) {
    const { collection, query, where, onSnapshot } = this.f;
    const q = query(collection(this.db, 'games'), where('members', 'array-contains', this.user.uid));
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => b.updatedAt - a.updatedAt)), (e) => { console.error(e); cb([]); });
  }
  watchGame(id, cb) {
    return this.f.onSnapshot(this.ref(id), (d) => cb(d.exists() ? { ...d.data(), id: d.id } : null), () => cb(null));
  }
  async createGame(game) {
    const id = game.id || newId();
    const data = { ...game, id, ownerUid: this.user.uid, members: [this.user.uid], createdAt: game.createdAt || now(), updatedAt: now(), events: game.events || [] };
    await this.f.setDoc(this.ref(id), data);
    return id;
  }
  // Zápisy nečakajú na server: Firestore ich uloží lokálne a odošle, keď je spojenie.
  updateGame(id, patch) {
    this.f.updateDoc(this.ref(id), { ...patch, updatedAt: now() }).catch(console.error);
  }
  addEvent(id, ev) {
    this.f.updateDoc(this.ref(id), { events: this.f.arrayUnion(ev), updatedAt: now() }).catch(console.error);
  }
  removeEvent(id, ev) {
    this.f.updateDoc(this.ref(id), { events: this.f.arrayRemove(ev), updatedAt: now() }).catch(console.error);
  }
  async deleteGame(id) { await this.f.deleteDoc(this.ref(id)); }
  async joinGame(id) {
    await this.f.updateDoc(this.ref(id), { members: this.f.arrayUnion(this.user.uid) });
  }
  async getCustomStages() {
    const d = await this.f.getDoc(this.f.doc(this.db, 'users', this.user.uid));
    return d.exists() ? d.data().customStages || [] : [];
  }
  async saveCustomStages(list) {
    await this.f.setDoc(this.f.doc(this.db, 'users', this.user.uid), { customStages: list }, { merge: true });
  }
}
