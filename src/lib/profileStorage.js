// profileStorage.js
// Simple localStorage wrapper for seller profile and templates (v1).
const KEY = 'wski_profile_v1';

const DEFAULT = {
  sellerName: '',
  sellerPhone: '',
  paymentLink: '',
  logoDataUrl: '' // data URL (base64) stored locally; keep small (<200 KB)
};

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const obj = JSON.parse(raw);
    // merge defaults to handle upgrades
    return Object.assign({}, DEFAULT, obj);
  } catch (e) {
    console.error('Could not load profile', e);
    return DEFAULT;
  }
}

export function saveProfile(profile) {
  try {
    const copy = Object.assign({}, DEFAULT, profile || {});
    localStorage.setItem(KEY, JSON.stringify(copy));
    return true;
  } catch (e) {
    console.error('Could not save profile', e);
    return false;
  }
}

export function clearProfile() {
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch (e) {
    console.error('Clear profile failed', e);
    return false;
  }
}
