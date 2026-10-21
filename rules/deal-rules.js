// DEAL RULES — anyone can edit this file (see rules/README.md).
//
// metal value = grams × fineness × spot price. It is the MAX price worth paying.
// premium     = price ÷ metal value − 1   (−0.20 = 20 % below spot)
// The dashboard's Settings page can change the first three; Settings wins.

module.exports = {
  deals: {
    // BUY NOW: asking price below metal value (always).
    // OFFER: asking price at most this much over metal value (or no price shown)
    // and the seller takes offers → suggest an offer below spot.
    offerMaxPremium: 0.20,
    // Suggested offer = metal value minus this much (never above metal value).
    offerDiscount: 0.10,
    // More than this far under metal value = probably a per-piece price, a typo,
    // a copy or a scam → still listed, marked "unusually cheap — check".
    suspicious: -0.5,
  },

  // Auctions are alerted once, on the last check before they close (closing
  // before the next check + this many hours), if still below spot.
  auctionAlertMarginHours: 1,
};
