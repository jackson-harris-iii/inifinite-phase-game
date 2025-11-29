import { CardColor, CardType, Phase, RequirementType } from './types';

export const COLORS = [CardColor.RED, CardColor.BLUE, CardColor.GREEN, CardColor.YELLOW];

export const BOT_NAMES = [
  "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa",
  "Omega", "Sigma", "Vector", "Matrix", "Cipher", "Glitch", "Pixel", "Vortex", "Quantum", "Flux",
  "Neon", "Cyber", "Logic", "Binary", "Spark", "Volt", "Echo", "Pulse", "Nova", "Terra"
];

export const DEFAULT_TURN_DURATION = 30; // seconds

// Standard Phase 10 inspired phases as a fallback
export const STANDARD_PHASES: Phase[] = [
  {
    id: 1,
    name: "Phase 1",
    description: "2 Sets of 3",
    requirements: [
      { type: RequirementType.SET, count: 3 },
      { type: RequirementType.SET, count: 3 }
    ]
  },
  {
    id: 2,
    name: "Phase 2",
    description: "1 Set of 3 + 1 Run of 4",
    requirements: [
      { type: RequirementType.SET, count: 3 },
      { type: RequirementType.RUN, count: 4 }
    ]
  },
  {
    id: 3,
    name: "Phase 3",
    description: "1 Set of 4 + 1 Run of 4",
    requirements: [
      { type: RequirementType.SET, count: 4 },
      { type: RequirementType.RUN, count: 4 }
    ]
  },
  {
    id: 4,
    name: "Phase 4",
    description: "1 Run of 7",
    requirements: [
      { type: RequirementType.RUN, count: 7 }
    ]
  },
  {
    id: 5,
    name: "Phase 5",
    description: "1 Run of 8",
    requirements: [
      { type: RequirementType.RUN, count: 8 }
    ]
  },
  {
    id: 6,
    name: "Phase 6",
    description: "1 Run of 9",
    requirements: [
      { type: RequirementType.RUN, count: 9 }
    ]
  },
  {
    id: 7,
    name: "Phase 7",
    description: "2 Sets of 4",
    requirements: [
      { type: RequirementType.SET, count: 4 },
      { type: RequirementType.SET, count: 4 }
    ]
  },
  {
    id: 8,
    name: "Phase 8",
    description: "7 Cards of One Color",
    requirements: [
      { type: RequirementType.COLOR, count: 7 }
    ]
  },
  {
    id: 9,
    name: "Phase 9",
    description: "1 Set of 5 + 1 Set of 2",
    requirements: [
      { type: RequirementType.SET, count: 5 },
      { type: RequirementType.SET, count: 2 }
    ]
  },
  {
    id: 10,
    name: "Phase 10",
    description: "1 Set of 5 + 1 Set of 3",
    requirements: [
      { type: RequirementType.SET, count: 5 },
      { type: RequirementType.SET, count: 3 }
    ]
  }
];

export const TOTAL_ROUNDS = 10;
export const HAND_SIZE = 10;