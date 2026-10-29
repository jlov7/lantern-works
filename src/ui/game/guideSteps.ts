// The guided first day's steps and the context its coachmarks read.
import { createContext } from 'react';

export const GUIDE_STEPS = [
  { title: 'Someone at your door', text: 'Meet your first neighbour and look at the piece they need. Start with the studio’s proof, or give it a direction of your own. Choose Next when you are ready to make the promise.' },
  { title: 'Your first promise', text: 'The price, work and deadline are above the piece. Take it when you are ready. You can change what the studio sells in Studio before answering anyone; your first answer fixes today’s offer.' },
  { title: 'Open the shop', text: "When you've answered who you want, open the shop and watch the day. Anyone you haven't answered walks away." },
  { title: 'The evening', text: "What got done today, and how the studios down the street are doing. Review tomorrow’s window when you are ready." },
  { title: 'Your studio', text: 'Hire help, book a temp or overtime, buy upgrades or hand out flyers. Each one costs money and changes what you can promise.' },
] as const;

export interface GuideApi {
  step: number | null;
  next: () => void;
  skip: () => void;
}

export const GuideContext = createContext<GuideApi>({ step: null, next: () => {}, skip: () => {} });
