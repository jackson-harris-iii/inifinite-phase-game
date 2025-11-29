import { Card, CardColor, CardType, PhaseRequirement, RequirementType, Meld } from '../types';
import { COLORS } from '../constants';

// --- Deck Management ---

export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  let idCounter = 0;

  // 2 sets of numbers 1-12 for each color
  COLORS.forEach(color => {
    for (let set = 0; set < 2; set++) {
      for (let val = 1; val <= 12; val++) {
        deck.push({
          id: `card-${idCounter++}`,
          type: CardType.NUMBER,
          color: color,
          value: val,
          displayValue: val.toString()
        });
      }
    }
  });

  // 8 Wilds
  for (let i = 0; i < 8; i++) {
    deck.push({
      id: `card-${idCounter++}`,
      type: CardType.WILD,
      color: CardColor.WILD,
      value: 25, // Score value
      displayValue: 'W'
    });
  }

  // 4 Skips
  for (let i = 0; i < 4; i++) {
    deck.push({
      id: `card-${idCounter++}`,
      type: CardType.SKIP,
      color: CardColor.SKIP,
      value: 15, // Score value
      displayValue: 'S'
    });
  }

  return deck;
};

export const shuffleDeck = (deck: Card[]): Card[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

export const dealCards = (deck: Card[], playerCount: number, handSize: number = 10) => {
  const hands: Card[][] = Array(playerCount).fill([]).map(() => []);
  let currentDeck = [...deck];

  for (let i = 0; i < handSize; i++) {
    for (let p = 0; p < playerCount; p++) {
      if (currentDeck.length > 0) {
        const card = currentDeck.pop()!;
        hands[p] = [...hands[p], card];
      }
    }
  }
  return { hands, remainingDeck: currentDeck };
};

// --- Validation Logic ---

// Helper: Check if a group of cards forms a valid Set (Same Number)
export const isValidSet = (cards: Card[], requiredCount: number): boolean => {
  if (cards.length < requiredCount) return false;
  
  // Filter out wilds
  const naturalCards = cards.filter(c => c.type === CardType.NUMBER);
  const wilds = cards.filter(c => c.type === CardType.WILD);

  // If all wilds, it's valid
  if (naturalCards.length === 0) return true;

  // Check if all natural cards have the same value
  const firstValue = naturalCards[0].value;
  const allSame = naturalCards.every(c => c.value === firstValue);

  return allSame && (naturalCards.length + wilds.length >= requiredCount);
};

// Helper: Check if a group forms a valid Color set
export const isValidColor = (cards: Card[], requiredCount: number): boolean => {
  if (cards.length < requiredCount) return false;
  
  const naturalCards = cards.filter(c => c.type === CardType.NUMBER || c.type === CardType.SKIP);
  const wilds = cards.filter(c => c.type === CardType.WILD);

  if (naturalCards.length === 0) return true;

  const firstColor = naturalCards[0].color;
  const allSame = naturalCards.every(c => c.color === firstColor);

  return allSame && (naturalCards.length + wilds.length >= requiredCount);
};

// Helper: Check if a group forms a valid Run (Sequential)
export const isValidRun = (cards: Card[], requiredCount: number): boolean => {
  if (cards.length < requiredCount) return false;

  const naturalCards = cards.filter(c => c.type === CardType.NUMBER).sort((a, b) => a.value - b.value);
  const wildCount = cards.filter(c => c.type === CardType.WILD).length;

  if (naturalCards.length === 0) return true; // All wilds is a valid run of anything

  let neededWilds = 0;
  
  // Check gaps between natural cards
  for (let i = 0; i < naturalCards.length - 1; i++) {
    const diff = naturalCards[i+1].value - naturalCards[i].value;
    if (diff === 0) return false; // Duplicates not allowed in a run
    if (diff > 1) {
      neededWilds += (diff - 1);
    }
  }

  return wildCount >= neededWilds;
};

// Main Validator
export const validatePhaseHand = (selectedCards: Card[], requirements: PhaseRequirement[]): { valid: boolean, groups?: Card[][] } => {
  const cards = [...selectedCards];
  
  if (requirements.length === 1) {
    const req = requirements[0];
    let valid = false;
    if (req.type === RequirementType.SET) valid = isValidSet(cards, req.count);
    if (req.type === RequirementType.COLOR) valid = isValidColor(cards, req.count);
    if (req.type === RequirementType.RUN) valid = isValidRun(cards, req.count);
    return { valid, groups: valid ? [cards] : undefined };
  }

  if (requirements.length === 2) {
    const n = cards.length;
    for (let i = 1; i < (1 << n) - 1; i++) {
      const group1: Card[] = [];
      const group2: Card[] = [];
      
      for (let j = 0; j < n; j++) {
        if ((i >> j) & 1) group1.push(cards[j]);
        else group2.push(cards[j]);
      }

      const check1 = checkSingleReq(group1, requirements[0]) && checkSingleReq(group2, requirements[1]);
      if (check1) return { valid: true, groups: [group1, group2] };

      const check2 = checkSingleReq(group2, requirements[0]) && checkSingleReq(group1, requirements[1]);
      if (check2) return { valid: true, groups: [group2, group1] };
    }
  }

  return { valid: false };
};

const checkSingleReq = (cards: Card[], req: PhaseRequirement): boolean => {
  if (req.type === RequirementType.SET) return isValidSet(cards, req.count);
  if (req.type === RequirementType.COLOR) return isValidColor(cards, req.count);
  if (req.type === RequirementType.RUN) return isValidRun(cards, req.count);
  return false;
};

// Hitting Validator: Can we add this single card to this existing meld?
export const canAddToMeld = (card: Card, meld: Meld): boolean => {
  // Cannot add Skips to melds usually
  if (card.type === CardType.SKIP) return false;

  // Try combining current meld cards + new card
  const newGroup = [...meld.cards, card];

  if (meld.type === RequirementType.SET) {
    // For Sets, count doesn't matter as long as it's > required, which it is if it was already a valid meld
    return isValidSet(newGroup, meld.cards.length); 
  }

  if (meld.type === RequirementType.COLOR) {
    return isValidColor(newGroup, meld.cards.length);
  }

  if (meld.type === RequirementType.RUN) {
    return isValidRun(newGroup, meld.cards.length);
  }

  return false;
};

// --- Scoring ---
export const calculateScore = (hand: Card[]): number => {
  return hand.reduce((acc, card) => {
    if (card.type === CardType.WILD) return acc + 25;
    if (card.type === CardType.SKIP) return acc + 15;
    if (card.value >= 10) return acc + 10;
    return acc + 5;
  }, 0);
};