import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PRICE = 101;
const ERR_INVALID_NFT_ID = 102;
const ERR_INVALID_DURATION = 105;
const ERR_INVALID_INTEREST_RATE = 104;
const ERR_LISTING_ALREADY_EXISTS = 106;
const ERR_LISTING_NOT_FOUND = 107;
const ERR_INVALID_LISTING_TYPE = 115;
const ERR_INVALID_FEE_RATE = 116;
const ERR_INVALID_CURRENCY = 119;
const ERR_INVALID_MIN_PRICE = 110;
const ERR_INVALID_MAX_BID = 111;
const ERR_POOL_NOT_VERIFIED = 109;
const ERR_MAX_LISTINGS_EXCEEDED = 114;
const ERR_INVALID_UPDATE_PARAM = 113;
const ERR_INVALID_STATUS = 120;
const ERR_INVALID_BIDDER = 118;

interface Listing {
  nftId: number;
  price: number;
  minPrice: number;
  seller: string;
  timestamp: number;
  duration: number;
  interestRate: number;
  listingType: string;
  feeRate: number;
  owner: string;
  currency: string;
  status: boolean;
  maxBid: number;
}

interface ListingUpdate {
  updatePrice: number;
  updateMinPrice: number;
  updateTimestamp: number;
  updater: string;
}

interface Bid {
  bidAmount: number;
  timestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

interface NftTrait {
  transfer: (id: number, from: string, to: string) => Result<boolean>;
}

class MockNftContract implements NftTrait {
  owners: Map<number, string> = new Map();

  transfer(id: number, from: string, to: string): Result<boolean> {
    const owner = this.owners.get(id);
    if (owner !== from) return { ok: false, value: false };
    this.owners.set(id, to);
    return { ok: true, value: true };
  }
}

class FinancingPoolMock {
  state: {
    nextListingId: number;
    maxListings: number;
    poolFee: number;
    poolAdmin: string | null;
    listings: Map<number, Listing>;
    listingUpdates: Map<number, ListingUpdate>;
    listingsByNft: Map<number, number>;
    bids: Map<string, Bid>;
    poolDeposits: Map<string, number>;
  } = {
    nextListingId: 0,
    maxListings: 1000,
    poolFee: 100,
    poolAdmin: null,
    listings: new Map(),
    listingUpdates: new Map(),
    listingsByNft: new Map(),
    bids: new Map(),
    poolDeposits: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  nftContract: MockNftContract = new MockNftContract();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextListingId: 0,
      maxListings: 1000,
      poolFee: 100,
      poolAdmin: null,
      listings: new Map(),
      listingUpdates: new Map(),
      listingsByNft: new Map(),
      bids: new Map(),
      poolDeposits: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
    this.nftContract = new MockNftContract();
  }

  setPoolAdmin(adminPrincipal: string): Result<boolean> {
    if (adminPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.poolAdmin !== null) {
      return { ok: false, value: false };
    }
    this.state.poolAdmin = adminPrincipal;
    return { ok: true, value: true };
  }

  setPoolFee(newFee: number): Result<boolean> {
    if (!this.state.poolAdmin) return { ok: false, value: false };
    this.state.poolFee = newFee;
    return { ok: true, value: true };
  }

  depositToPool(amount: number): Result<boolean> {
    if (amount <= 0) return { ok: false, value: false };
    this.stxTransfers.push({ amount, from: this.caller, to: "contract" });
    const current = this.state.poolDeposits.get(this.caller) || 0;
    this.state.poolDeposits.set(this.caller, current + amount);
    return { ok: true, value: true };
  }

  withdrawFromPool(amount: number): Result<boolean> {
    const balance = this.state.poolDeposits.get(this.caller) || 0;
    if (balance < amount) return { ok: false, value: false };
    this.stxTransfers.push({ amount, from: "contract", to: this.caller });
    this.state.poolDeposits.set(this.caller, balance - amount);
    return { ok: true, value: true };
  }

  listInvoice(
    nftId: number,
    price: number,
    minPrice: number,
    duration: number,
    interestRate: number,
    listingType: string,
    feeRate: number,
    currency: string,
    maxBid: number
  ): Result<number> {
    if (this.state.nextListingId >= this.state.maxListings) return { ok: false, value: ERR_MAX_LISTINGS_EXCEEDED };
    if (nftId <= 0) return { ok: false, value: ERR_INVALID_NFT_ID };
    if (price <= 0) return { ok: false, value: ERR_INVALID_PRICE };
    if (minPrice <= 0) return { ok: false, value: ERR_INVALID_MIN_PRICE };
    if (duration <= 0) return { ok: false, value: ERR_INVALID_DURATION };
    if (interestRate > 20) return { ok: false, value: ERR_INVALID_INTEREST_RATE };
    if (!["fixed", "auction"].includes(listingType)) return { ok: false, value: ERR_INVALID_LISTING_TYPE };
    if (feeRate > 10) return { ok: false, value: ERR_INVALID_FEE_RATE };
    if (!["STX", "USD"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    if (maxBid <= 0) return { ok: false, value: ERR_INVALID_MAX_BID };
    if (this.state.listingsByNft.has(nftId)) return { ok: false, value: ERR_LISTING_ALREADY_EXISTS };
    if (!this.state.poolAdmin) return { ok: false, value: ERR_POOL_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.poolFee, from: this.caller, to: this.state.poolAdmin });
    this.nftContract.transfer(nftId, this.caller, "contract");

    const id = this.state.nextListingId;
    const listing: Listing = {
      nftId,
      price,
      minPrice,
      seller: this.caller,
      timestamp: this.blockHeight,
      duration,
      interestRate,
      listingType,
      feeRate,
      owner: this.caller,
      currency,
      status: true,
      maxBid,
    };
    this.state.listings.set(id, listing);
    this.state.listingsByNft.set(nftId, id);
    this.state.nextListingId++;
    return { ok: true, value: id };
  }

  getListing(id: number): Listing | null {
    return this.state.listings.get(id) || null;
  }

  updateListing(id: number, updatePrice: number, updateMinPrice: number): Result<boolean> {
    const listing = this.state.listings.get(id);
    if (!listing) return { ok: false, value: false };
    if (listing.seller !== this.caller) return { ok: false, value: false };
    if (updatePrice <= 0) return { ok: false, value: false };
    if (updateMinPrice <= 0) return { ok: false, value: false };

    const updated: Listing = {
      ...listing,
      price: updatePrice,
      minPrice: updateMinPrice,
      timestamp: this.blockHeight,
    };
    this.state.listings.set(id, updated);
    this.state.listingUpdates.set(id, {
      updatePrice,
      updateMinPrice,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  placeBid(listingId: number, bidAmount: number): Result<boolean> {
    const listing = this.state.listings.get(listingId);
    if (!listing) return { ok: false, value: false };
    if (!listing.status) return { ok: false, value: false };
    if (bidAmount > listing.maxBid) return { ok: false, value: false };
    if (bidAmount < listing.minPrice) return { ok: false, value: false };
    this.stxTransfers.push({ amount: bidAmount, from: this.caller, to: "contract" });
    const key = `${listingId}-${this.caller}`;
    this.state.bids.set(key, {
      bidAmount,
      timestamp: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  acceptBid(listingId: number, bidder: string): Result<boolean> {
    const listing = this.state.listings.get(listingId);
    if (!listing) return { ok: false, value: false };
    const key = `${listingId}-${bidder}`;
    const bid = this.state.bids.get(key);
    if (!bid) return { ok: false, value: false };
    if (listing.seller !== this.caller) return { ok: false, value: false };
    this.stxTransfers.push({ amount: bid.bidAmount, from: "contract", to: listing.seller });
    this.nftContract.transfer(listing.nftId, "contract", bidder);
    const updated: Listing = { ...listing, status: false };
    this.state.listings.set(listingId, updated);
    this.state.bids.delete(key);
    return { ok: true, value: true };
  }

  getListingCount(): Result<number> {
    return { ok: true, value: this.state.nextListingId };
  }

  checkListingExistence(nftId: number): Result<boolean> {
    return { ok: true, value: this.state.listingsByNft.has(nftId) };
  }
}

describe("FinancingPool", () => {
  let contract: FinancingPoolMock;

  beforeEach(() => {
    contract = new FinancingPoolMock();
    contract.reset();
  });

  it("creates a listing successfully", () => {
    contract.setPoolAdmin("ST2TEST");
    const result = contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const listing = contract.getListing(0);
    expect(listing?.nftId).toBe(1);
    expect(listing?.price).toBe(1000);
    expect(listing?.minPrice).toBe(500);
    expect(listing?.duration).toBe(30);
    expect(listing?.interestRate).toBe(5);
    expect(listing?.listingType).toBe("fixed");
    expect(listing?.feeRate).toBe(2);
    expect(listing?.currency).toBe("STX");
    expect(listing?.maxBid).toBe(2000);
    expect(contract.stxTransfers).toEqual([{ amount: 100, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate nft listings", () => {
    contract.setPoolAdmin("ST2TEST");
    contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    const result = contract.listInvoice(
      1,
      2000,
      1000,
      60,
      10,
      "auction",
      5,
      "USD",
      3000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_LISTING_ALREADY_EXISTS);
  });

  it("rejects listing without pool admin", () => {
    const result = contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_POOL_NOT_VERIFIED);
  });

  it("rejects invalid price", () => {
    contract.setPoolAdmin("ST2TEST");
    const result = contract.listInvoice(
      1,
      0,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PRICE);
  });

  it("rejects invalid listing type", () => {
    contract.setPoolAdmin("ST2TEST");
    const result = contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "invalid",
      2,
      "STX",
      2000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LISTING_TYPE);
  });

  it("updates a listing successfully", () => {
    contract.setPoolAdmin("ST2TEST");
    contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    const result = contract.updateListing(0, 1500, 750);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const listing = contract.getListing(0);
    expect(listing?.price).toBe(1500);
    expect(listing?.minPrice).toBe(750);
    const update = contract.state.listingUpdates.get(0);
    expect(update?.updatePrice).toBe(1500);
    expect(update?.updateMinPrice).toBe(750);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent listing", () => {
    contract.setPoolAdmin("ST2TEST");
    const result = contract.updateListing(99, 1500, 750);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-seller", () => {
    contract.setPoolAdmin("ST2TEST");
    contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateListing(0, 1500, 750);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets pool fee successfully", () => {
    contract.setPoolAdmin("ST2TEST");
    const result = contract.setPoolFee(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.poolFee).toBe(200);
    contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    expect(contract.stxTransfers).toEqual([{ amount: 200, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects pool fee change without pool admin", () => {
    const result = contract.setPoolFee(200);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct listing count", () => {
    contract.setPoolAdmin("ST2TEST");
    contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    contract.listInvoice(
      2,
      2000,
      1000,
      60,
      10,
      "auction",
      5,
      "USD",
      3000
    );
    const result = contract.getListingCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks listing existence correctly", () => {
    contract.setPoolAdmin("ST2TEST");
    contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    const result = contract.checkListingExistence(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkListingExistence(99);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("parses listing parameters with Clarity types", () => {
    const nftId = uintCV(1);
    const price = uintCV(1000);
    expect(nftId.value).toEqual(BigInt(1));
    expect(price.value).toEqual(BigInt(1000));
  });

  it("rejects listing with max listings exceeded", () => {
    contract.setPoolAdmin("ST2TEST");
    contract.state.maxListings = 1;
    contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    const result = contract.listInvoice(
      2,
      2000,
      1000,
      60,
      10,
      "auction",
      5,
      "USD",
      3000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_LISTINGS_EXCEEDED);
  });

  it("sets pool admin successfully", () => {
    const result = contract.setPoolAdmin("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.poolAdmin).toBe("ST2TEST");
  });

  it("rejects invalid pool admin", () => {
    const result = contract.setPoolAdmin("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("places a bid successfully", () => {
    contract.setPoolAdmin("ST2TEST");
    contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    contract.caller = "ST3BIDDER";
    const result = contract.placeBid(0, 800);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const key = "0-ST3BIDDER";
    const bid = contract.state.bids.get(key);
    expect(bid?.bidAmount).toBe(800);
  });

  it("rejects bid on non-existent listing", () => {
    contract.setPoolAdmin("ST2TEST");
    contract.caller = "ST3BIDDER";
    const result = contract.placeBid(99, 800);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects bid below min price", () => {
    contract.setPoolAdmin("ST2TEST");
    contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    contract.caller = "ST3BIDDER";
    const result = contract.placeBid(0, 400);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("accepts a bid successfully", () => {
    contract.setPoolAdmin("ST2TEST");
    contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    contract.caller = "ST3BIDDER";
    contract.placeBid(0, 800);
    contract.caller = "ST1TEST";
    const result = contract.acceptBid(0, "ST3BIDDER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const listing = contract.getListing(0);
    expect(listing?.status).toBe(false);
    const key = "0-ST3BIDDER";
    expect(contract.state.bids.has(key)).toBe(false);
  });

  it("rejects accept bid by non-seller", () => {
    contract.setPoolAdmin("ST2TEST");
    contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    contract.caller = "ST3BIDDER";
    contract.placeBid(0, 800);
    contract.caller = "ST4FAKE";
    const result = contract.acceptBid(0, "ST3BIDDER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects accept non-existent bid", () => {
    contract.setPoolAdmin("ST2TEST");
    contract.listInvoice(
      1,
      1000,
      500,
      30,
      5,
      "fixed",
      2,
      "STX",
      2000
    );
    const result = contract.acceptBid(0, "ST3BIDDER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("deposits to pool successfully", () => {
    const result = contract.depositToPool(500);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.poolDeposits.get("ST1TEST")).toBe(500);
  });

  it("rejects invalid deposit amount", () => {
    const result = contract.depositToPool(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("withdraws from pool successfully", () => {
    contract.depositToPool(500);
    const result = contract.withdrawFromPool(300);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.poolDeposits.get("ST1TEST")).toBe(200);
  });

  it("rejects withdraw exceeding balance", () => {
    contract.depositToPool(500);
    const result = contract.withdrawFromPool(600);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});