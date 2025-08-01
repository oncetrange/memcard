# MemCard
Web app for create and review cards.

## How to use?
Input question (front) and answer (back) and click 「Save」 to create card.
Click 「Review」 to review cards.
When reviewing:
- Swipe up to flip the card.
- Swipe left means forget, the card will reappear later.
- Swipe right means remember.

## Review strategy
1. Choose cards (20 at most) according to their 「next review date」(earlier first).
2. If you swipe right the first time (in this review) you see the card, the next review time will be double (initialize to 6 hours for the card not 2. in last review).
3. Forget will half the next review time for the card not 2. in last review, else decrease more than half (longer next review time, more decrease).
4. next review time will not be lese than 45 minutes (3 forget).
