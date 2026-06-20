# 09 — Integration Testing

## Scope
End-to-end flows across all services:
- Full auction lifecycle: schedule → live → bid → close → invoice → pay → ship
- Reserve not met: auction closes unsold, no invoice created
- Phone verification gate: EMAIL_VERIFIED user blocked from bidding until phone verified
- Payment expiry: invoice expires after window, lot marked unsold
- Admin flows: create lot → schedule auction → monitor bids → dispatch fulfilment

## Prerequisites
All domains complete.

## Plan file
`plan.md` — implementation steps to be added here.
