// Small DOM helpers shared by the view modules. Nothing here touches the document at
// import time, so the pure helpers can be imported (and tested) outside a browser.

export const $ = (id)=>document.getElementById(id);

export function escapeHtml(s){
  return (s || '').toString().replace(/[&<>"']/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

export function showError(msg){
  const el = $('app-errors');
  if(el){ el.textContent = msg; el.classList.remove('hidden'); }
  console.error(msg);
}

export function showToast(msg, timeout=3000){
  const toast = $('app-toast');
  if(!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(()=>{ toast.classList.add('hidden'); toast.textContent = ''; }, timeout);
}
