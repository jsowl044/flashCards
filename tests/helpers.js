// Shared test utilities (not a test file itself).

// Replaces the global localStorage with an in-memory one and returns its backing Map.
export function installFakeStorage(){
  const map = new Map();
  globalThis.localStorage = {
    getItem: (key)=>map.has(key) ? map.get(key) : null,
    setItem: (key, value)=>{ map.set(key, String(value)); },
    removeItem: (key)=>{ map.delete(key); },
    clear: ()=>{ map.clear(); }
  };
  return map;
}
