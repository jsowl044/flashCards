// Spaced-repetition scheduling. Pure functions only: no DOM, no storage, and the
// clock is always a parameter, so every rule here can be unit-tested.

export function roundInterval(days){ return Math.max(1, Math.round(days * 10) / 10); }

// Returns the card as it would look after `evaluation` ('again' | 'hard' | 'good' | 'easy'),
// without mutating the input. The same calculation powers the button previews and the saved card.
export function calculateSchedule(card, evaluation, now=new Date()){
  const nextCard = {
    ...card,
    easeFactor: Number(card.easeFactor || 2.5),
    reps: Number(card.reps || 0),
    interval: Number(card.interval || 0)
  };
  const next = new Date(now);
  let minutes = null;
  let days = null;
  const inLearning = nextCard.state !== 'REVIEW';

  if(inLearning){
    if(evaluation === 'again'){
      minutes = 1; nextCard.reps = 0; nextCard.easeFactor = Math.max(1.3, +(nextCard.easeFactor - 0.20).toFixed(2)); nextCard.state = 'LEARNING';
    } else if(evaluation === 'hard'){
      minutes = 8; nextCard.reps = 0; nextCard.easeFactor = Math.max(1.3, +(nextCard.easeFactor - 0.15).toFixed(2)); nextCard.state = 'LEARNING';
    } else if(evaluation === 'good'){
      if(nextCard.reps >= 1){
        days = 1; nextCard.reps = 1; nextCard.interval = 1; nextCard.state = 'REVIEW';
      } else {
        minutes = 15; nextCard.reps = 1; nextCard.interval = 0; nextCard.state = 'LEARNING';
      }
    } else if(evaluation === 'easy'){
      days = 4; nextCard.reps = 1; nextCard.interval = 4; nextCard.easeFactor = +(nextCard.easeFactor + 0.15).toFixed(2); nextCard.state = 'REVIEW';
    }
  } else {
    if(evaluation === 'again'){
      minutes = 1; nextCard.reps = 0; nextCard.interval = 0; nextCard.easeFactor = Math.max(1.3, +(nextCard.easeFactor - 0.20).toFixed(2)); nextCard.state = 'LEARNING';
    } else if(evaluation === 'hard'){
      days = roundInterval(nextCard.interval * 1.2);
      nextCard.easeFactor = Math.max(1.3, +(nextCard.easeFactor - 0.15).toFixed(2));
      // A Hard review has already moved the card beyond its first 1-day review.
      // Without this, later Good/Easy evaluations would keep using the fixed 6-day step.
      nextCard.reps = Math.max(2, nextCard.reps);
      nextCard.interval = days;
    } else if(evaluation === 'good'){
      nextCard.reps += 1;
      days = nextCard.reps === 2 ? 6 : roundInterval(nextCard.interval * nextCard.easeFactor);
      nextCard.interval = days;
    } else if(evaluation === 'easy'){
      const nextReps = nextCard.reps + 1;
      // The second successful review has a fixed 6-day Good interval. Easy must
      // be later than that too, rather than being calculated from the old 1-day interval.
      const goodDays = nextReps === 2
        ? 6
        : roundInterval(nextCard.interval * nextCard.easeFactor);
      nextCard.reps = nextReps;
      nextCard.easeFactor = +(nextCard.easeFactor + 0.15).toFixed(2);
      // Easy is meaningfully later than Good, including on the initial 6-day review.
      days = Math.max(roundInterval(goodDays * 1.3), roundInterval(nextCard.interval * nextCard.easeFactor * 1.3));
      nextCard.interval = days;
    }
  }

  if(minutes !== null) next.setTime(now.getTime() + minutes * 60 * 1000);
  else next.setTime(now.getTime() + days * 24 * 60 * 60 * 1000);
  nextCard.lastEvaluation = evaluation;
  nextCard.nextReview = next.toISOString();
  return { card: nextCard, minutes: minutes === null ? days * 1440 : minutes, days: days === null ? Math.round(minutes / 1440) : days };
}

// Applies an evaluation to a card in place (the study queue holds the live card objects).
export function scheduleCard(card, evaluation, now=new Date()){
  Object.assign(card, calculateSchedule(card, evaluation, now).card);
}

// Label shown under each rating button, e.g. "8 min", "3 h", "6 days".
export function projectedSchedule(card, evaluation, now=new Date()){
  const schedule = calculateSchedule(card, evaluation, now);
  const displayDays = Math.round(schedule.minutes / 144) / 10;
  const human = schedule.minutes < 60
    ? `${schedule.minutes} min`
    : schedule.minutes < 1440
      ? `${Math.round(schedule.minutes / 60)} h`
      : `${displayDays} day${displayDays === 1 ? '' : 's'}`;
  return {...schedule, human};
}

// Longer-interval (more mature) cards first, descending down to the shortest-cooldown
// learning cards; ties broken by how long a card has been overdue (most overdue first).
export function compareByCooldown(a, b){
  const diff = Number(b.interval || 0) - Number(a.interval || 0);
  if(diff !== 0) return diff;
  return (a.nextReview || '').localeCompare(b.nextReview || '');
}

export function getDueCards(deck, now=new Date()){
  const nowISO = now.toISOString();
  return (deck.cards || []).filter(c=>c && c.nextReview <= nowISO).sort(compareByCooldown);
}

// "now" / "in 5 min" / "in 3 h" / "tomorrow" / "2.5 days" for the earliest card in a deck.
export function computeNextDueInfo(deck, now=new Date()){
  if(!deck.cards || deck.cards.length===0) return '—';
  const dates = deck.cards.map(c=>c.nextReview).filter(Boolean);
  if(dates.length===0) return '—';
  const minDate = dates.reduce((a,b)=> a < b ? a : b);
  const diffMs = new Date(minDate) - now;
  // Match getDueCards' exact comparison so this label never says "now" before a card is actually due.
  if(diffMs <= 0) return 'now';
  const diffMinutes = Math.ceil(diffMs / (1000*60));
  if(diffMinutes < 60) return `in ${diffMinutes} min`;
  if(diffMinutes < 1440){ const hrs = Math.round(diffMinutes/60); return `in ${hrs} h`; }
  const days = Math.round(diffMinutes / 144) / 10;
  if(days===1) return 'tomorrow';
  return `${days} days`;
}

// A study session's queue is a snapshot, so cards whose cooldown expires mid-session
// (never due at the start, or just rated Again/Hard) have to be merged in. Everything up
// to and including `index` stays untouched so the card on screen can't be swapped out
// from under an in-progress answer. Returns the same array when there is nothing to add.
export function mergeNewlyDue(queue, index, deckCards, now=new Date()){
  const nowISO = now.toISOString();
  const remainingIds = new Set(queue.slice(index).map(c=>c.id));
  const newlyDue = (deckCards || []).filter(c=>c && c.nextReview <= nowISO && !remainingIds.has(c.id));
  if(newlyDue.length === 0) return queue;
  const tail = queue.slice(index + 1).concat(newlyDue).sort(compareByCooldown);
  return queue.slice(0, index + 1).concat(tail);
}
