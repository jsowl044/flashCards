// Browser/OS integration that isn't part of the app's own logic.
import { $ } from './dom.js';

// Follow the OS light/dark preference.
export function initTheme(){
  const apply = (dark)=> document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const query = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if(!query){ apply(true); return; }
  apply(query.matches);
  query.addEventListener('change', e=>apply(e.matches));
}

// Keep the fixed search bar pinned just above the on-screen keyboard: iOS Safari
// doesn't reflow position:fixed elements when the keyboard opens, so we shift it
// by however much the visual viewport has shrunk.
export function initKeyboardAwareBar(){
  const bar = $('deck-bottom-bar');
  const viewport = window.visualViewport;
  if(!bar || !viewport) return;
  const reposition = ()=>{
    const offset = window.innerHeight - viewport.height - viewport.offsetTop;
    bar.style.transform = offset > 1 ? `translateY(-${offset}px)` : '';
  };
  viewport.addEventListener('resize', reposition);
  viewport.addEventListener('scroll', reposition);
}
