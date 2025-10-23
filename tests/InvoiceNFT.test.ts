import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_AMOUNT = 101;
const ERR_INVALID_DUE_DATE = 102;
const ERR_INVALID_BUYER = 103;
const ERR_INVOICE_NOT_FOUND = 105;
const ERR_INVALID_DESCRIPTION = 108;
const ERR_INVALID_CURRENCY = 109;
const ERR_INVOICE_PAID = 111;
const ERR_INVOICE_EXPIRED = 112;
const ERR_INVALID_UPDATE_PARAM = 113;
const ERR_MAX_INVOICES_EXCEEDED = 114;
const ERR_INVALID_DISCOUNT_RATE = 115;
const ERR_INVALID_PENALTY_RATE = 116;
const ERR_INVALID_LOCATION = 117;
const ERR_INVALID_TERMS = 118;
const ERR_INVALID_QUANTITY = 119;
const ERR_INVALID_PRICE = 120;
const ERR_AUTHORITY_NOT_VERIFIED = 107;

interface Invoice {
  amount: number;
  dueDate: number;
  buyer: string;
  supplier: string;
  paid: boolean;
  timestamp: number;
  description: string;
  currency: string;
  status: string;
  discountRate: number;
  penaltyRate: number;
  location: string;
  terms: string;
  quantity: number;
  unitPrice: number;
}

interface InvoiceUpdate {
  updateAmount: number;
  updateDueDate: number;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class InvoiceNFTMock {
  state: {
    nextInvoiceId: number;
    maxInvoices: number;
    creationFee: number;
    authorityContract: string | null;
    invoices: Map<number, Invoice>;
    invoiceUpdates: Map<number, InvoiceUpdate>;
    invoicesBySupplier: Map<string, number[]>;
  } = {
    nextInvoiceId: 0,
    maxInvoices: 10000,
    creationFee: 500,
    authorityContract: null,
    invoices: new Map(),
    invoiceUpdates: new Map(),
    invoicesBySupplier: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];
  nftOwners: Map<number, string> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextInvoiceId: 0,
      maxInvoices: 10000,
      creationFee: 500,
      authorityContract: null,
      invoices: new Map(),
      invoiceUpdates: new Map(),
      invoicesBySupplier: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
    this.stxTransfers = [];
    this.nftOwners = new Map();
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setCreationFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.creationFee = newFee;
    return { ok: true, value: true };
  }

  mintInvoice(
    amount: number,
    dueDate: number,
    buyer: string,
    description: string,
    currency: string,
    discountRate: number,
    penaltyRate: number,
    location: string,
    terms: string,
    quantity: number,
    unitPrice: number
  ): Result<number> {
    if (this.state.nextInvoiceId >= this.state.maxInvoices) return { ok: false, value: ERR_MAX_INVOICES_EXCEEDED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (dueDate <= this.blockHeight) return { ok: false, value: ERR_INVALID_DUE_DATE };
    if (buyer === this.caller) return { ok: false, value: ERR_INVALID_BUYER };
    if (!description || description.length > 500) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!["STX", "USD", "BTC"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    if (discountRate > 50) return { ok: false, value: ERR_INVALID_DISCOUNT_RATE };
    if (penaltyRate > 100) return { ok: false, value: ERR_INVALID_PENALTY_RATE };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (terms.length > 1000) return { ok: false, value: ERR_INVALID_TERMS };
    if (quantity <= 0) return { ok: false, value: ERR_INVALID_QUANTITY };
    if (unitPrice <= 0) return { ok: false, value: ERR_INVALID_PRICE };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.creationFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextInvoiceId;
    const supplier = this.caller;
    const invoice: Invoice = {
      amount,
      dueDate,
      buyer,
      supplier,
      paid: false,
      timestamp: this.blockHeight,
      description,
      currency,
      status: "pending",
      discountRate,
      penaltyRate,
      location,
      terms,
      quantity,
      unitPrice,
    };
    this.state.invoices.set(id, invoice);
    const supplierInvoices = this.state.invoicesBySupplier.get(supplier) || [];
    supplierInvoices.push(id);
    if (supplierInvoices.length > 100) return { ok: false, value: ERR_MAX_INVOICES_EXCEEDED };
    this.state.invoicesBySupplier.set(supplier, supplierInvoices);
    this.nftOwners.set(id, supplier);
    this.state.nextInvoiceId++;
    return { ok: true, value: id };
  }

  getInvoice(id: number): Invoice | null {
    return this.state.invoices.get(id) || null;
  }

  transfer(id: number, recipient: string): Result<boolean> {
    const invoice = this.state.invoices.get(id);
    if (!invoice) return { ok: false, value: false };
    if (this.caller !== invoice.supplier) return { ok: false, value: false };
    if (invoice.paid) return { ok: false, value: false };
    if (this.blockHeight >= invoice.dueDate) return { ok: false, value: false };
    if (this.nftOwners.get(id) !== this.caller) return { ok: false, value: false };
    this.nftOwners.set(id, recipient);
    this.state.invoices.set(id, { ...invoice, supplier: recipient });
    return { ok: true, value: true };
  }

  markPaid(id: number): Result<boolean> {
    const invoice = this.state.invoices.get(id);
    if (!invoice) return { ok: false, value: false };
    if (this.caller !== invoice.buyer) return { ok: false, value: false };
    if (invoice.paid) return { ok: false, value: false };
    this.state.invoices.set(id, { ...invoice, paid: true, status: "paid" });
    return { ok: true, value: true };
  }

  updateInvoice(id: number, newAmount: number, newDueDate: number): Result<boolean> {
    const invoice = this.state.invoices.get(id);
    if (!invoice) return { ok: false, value: false };
    if (this.caller !== invoice.supplier) return { ok: false, value: false };
    if (invoice.paid) return { ok: false, value: false };
    if (newAmount <= 0) return { ok: false, value: false };
    if (newDueDate <= this.blockHeight) return { ok: false, value: false };
    this.state.invoices.set(id, { ...invoice, amount: newAmount, dueDate: newDueDate, timestamp: this.blockHeight });
    this.state.invoiceUpdates.set(id, {
      updateAmount: newAmount,
      updateDueDate: newDueDate,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  burnInvoice(id: number): Result<boolean> {
    const invoice = this.state.invoices.get(id);
    if (!invoice) return { ok: false, value: false };
    if (this.caller !== invoice.supplier) return { ok: false, value: false };
    if (invoice.paid) return { ok: false, value: false };
    if (this.nftOwners.get(id) !== this.caller) return { ok: false, value: false };
    this.state.invoices.delete(id);
    this.state.invoiceUpdates.delete(id);
    this.nftOwners.delete(id);
    return { ok: true, value: true };
  }

  getInvoiceCount(): Result<number> {
    return { ok: true, value: this.state.nextInvoiceId };
  }
}

describe("InvoiceNFT", () => {
  let contract: InvoiceNFTMock;

  beforeEach(() => {
    contract = new InvoiceNFTMock();
    contract.reset();
  });

  it("mints an invoice successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const invoice = contract.getInvoice(0);
    expect(invoice?.amount).toBe(1000);
    expect(invoice?.dueDate).toBe(100);
    expect(invoice?.buyer).toBe("ST3BUYER");
    expect(invoice?.supplier).toBe("ST1TEST");
    expect(invoice?.paid).toBe(false);
    expect(invoice?.description).toBe("Service description");
    expect(invoice?.currency).toBe("STX");
    expect(invoice?.status).toBe("pending");
    expect(invoice?.discountRate).toBe(5);
    expect(invoice?.penaltyRate).toBe(10);
    expect(invoice?.location).toBe("LocationX");
    expect(invoice?.terms).toBe("Terms and conditions");
    expect(invoice?.quantity).toBe(1);
    expect(invoice?.unitPrice).toBe(1000);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects mint without authority contract", () => {
    const result = contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid amount", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.mintInvoice(
      0,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("transfers invoice successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    const result = contract.transfer(0, "ST4RECIPIENT");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const invoice = contract.getInvoice(0);
    expect(invoice?.supplier).toBe("ST4RECIPIENT");
  });

  it("rejects transfer by non-supplier", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    contract.caller = "ST5FAKE";
    const result = contract.transfer(0, "ST4RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("marks invoice as paid successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    contract.caller = "ST3BUYER";
    const result = contract.markPaid(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const invoice = contract.getInvoice(0);
    expect(invoice?.paid).toBe(true);
    expect(invoice?.status).toBe("paid");
  });

  it("rejects mark paid by non-buyer", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    const result = contract.markPaid(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("updates invoice successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    const result = contract.updateInvoice(0, 1500, 150);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const invoice = contract.getInvoice(0);
    expect(invoice?.amount).toBe(1500);
    expect(invoice?.dueDate).toBe(150);
    const update = contract.state.invoiceUpdates.get(0);
    expect(update?.updateAmount).toBe(1500);
    expect(update?.updateDueDate).toBe(150);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for paid invoice", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    contract.caller = "ST3BUYER";
    contract.markPaid(0);
    contract.caller = "ST1TEST";
    const result = contract.updateInvoice(0, 1500, 150);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("burns invoice successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    const result = contract.burnInvoice(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const invoice = contract.getInvoice(0);
    expect(invoice).toBeNull();
  });

  it("rejects burn for paid invoice", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    contract.caller = "ST3BUYER";
    contract.markPaid(0);
    contract.caller = "ST1TEST";
    const result = contract.burnInvoice(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct invoice count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    contract.mintInvoice(
      2000,
      200,
      "ST4BUYER",
      "Another description",
      "USD",
      10,
      20,
      "LocationY",
      "Other terms",
      2,
      1000
    );
    const result = contract.getInvoiceCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("rejects mint with max invoices exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxInvoices = 1;
    contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    const result = contract.mintInvoice(
      2000,
      200,
      "ST4BUYER",
      "Another description",
      "USD",
      10,
      20,
      "LocationY",
      "Other terms",
      2,
      1000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_INVOICES_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets creation fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setCreationFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.creationFee).toBe(1000);
    contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects creation fee change without authority", () => {
    const result = contract.setCreationFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("parses invoice parameters with Clarity types", () => {
    const desc = stringUtf8CV("Test Description");
    const amount = uintCV(1000);
    expect(desc.value).toBe("Test Description");
    expect(amount.value).toEqual(BigInt(1000));
  });

  it("rejects transfer for expired invoice", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintInvoice(
      1000,
      100,
      "ST3BUYER",
      "Service description",
      "STX",
      5,
      10,
      "LocationX",
      "Terms and conditions",
      1,
      1000
    );
    contract.blockHeight = 101;
    const result = contract.transfer(0, "ST4RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});