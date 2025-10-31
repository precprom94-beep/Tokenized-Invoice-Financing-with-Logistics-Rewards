import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 403;
const ERR_INVALID_INVOICE_ID = 404;
const ERR_INVALID_TIMESTAMP = 405;
const ERR_INVALID_AMOUNT = 406;
const ERR_INVALID_CURRENCY = 407;
const ERR_INVALID_EARLY_FLAG = 408;
const ERR_ORACLE_ALREADY_EXISTS = 409;
const ERR_ORACLE_NOT_FOUND = 410;
const ERR_PAYMENT_ALREADY_VERIFIED = 411;
const ERR_INVALID_GRACE_PERIOD = 412;
const ERR_INVALID_INTEREST_RATE = 413;
const ERR_INVALID_PENALTY = 414;
const ERR_MAX_ORACLES_EXCEEDED = 415;
const ERR_INVALID_UPDATE_PARAM = 416;
const ERR_AUTHORITY_NOT_VERIFIED = 417;
const ERR_INVALID_LOCATION = 418;
const ERR_INVALID_STATUS = 419;
const ERR_INVALID_VOTING_THRESHOLD = 420;
const ERR_INVALID_MAX_REPORTS = 421;

interface Oracle {
  oraclePrincipal: string;
  name: string;
  location: string;
  status: boolean;
  timestamp: number;
  votingThreshold: number;
  gracePeriod: number;
  interestRate: number;
  penalty: number;
}

interface Payment {
  invoiceId: number;
  timestamp: number;
  amount: number;
  currency: string;
  early: boolean;
  reporter: string;
  status: boolean;
  gracePeriod: number;
  interestRate: number;
  penalty: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class PaymentOracleMock {
  state: {
    admin: string;
    nextOracleId: number;
    maxOracles: number;
    reportFee: number;
    authorityContract: string | null;
    maxReportsPerInvoice: number;
    oracles: Map<number, Oracle>;
    oraclesByName: Map<string, number>;
    verifiedPayments: Map<number, Payment>;
    paymentReports: Map<number, number[]>;
  } = {
    admin: "ST1TEST",
    nextOracleId: 0,
    maxOracles: 50,
    reportFee: 100,
    authorityContract: null,
    maxReportsPerInvoice: 5,
    oracles: new Map(),
    oraclesByName: new Map(),
    verifiedPayments: new Map(),
    paymentReports: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      admin: "ST1TEST",
      nextOracleId: 0,
      maxOracles: 50,
      reportFee: 100,
      authorityContract: null,
      maxReportsPerInvoice: 5,
      oracles: new Map(),
      oraclesByName: new Map(),
      verifiedPayments: new Map(),
      paymentReports: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (this.caller !== this.state.admin) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxOracles(newMax: number): Result<boolean> {
    if (this.caller !== this.state.admin) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (newMax <= 0) {
      return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    }
    this.state.maxOracles = newMax;
    return { ok: true, value: true };
  }

  setReportFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.admin) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (newFee < 0) {
      return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    }
    this.state.reportFee = newFee;
    return { ok: true, value: true };
  }

  setMaxReportsPerInvoice(newMax: number): Result<boolean> {
    if (this.caller !== this.state.admin) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (newMax <= 0) {
      return { ok: false, value: ERR_INVALID_MAX_REPORTS };
    }
    this.state.maxReportsPerInvoice = newMax;
    return { ok: true, value: true };
  }

  registerOracle(
    name: string,
    location: string,
    votingThreshold: number,
    gracePeriod: number,
    interestRate: number,
    penalty: number
  ): Result<number> {
    if (this.state.nextOracleId >= this.state.maxOracles) {
      return { ok: false, value: ERR_MAX_ORACLES_EXCEEDED };
    }
    if (!name || name.length > 50) {
      return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    }
    if (!location || location.length > 100) {
      return { ok: false, value: ERR_INVALID_LOCATION };
    }
    if (votingThreshold <= 0 || votingThreshold > 100) {
      return { ok: false, value: ERR_INVALID_VOTING_THRESHOLD };
    }
    if (gracePeriod > 30) {
      return { ok: false, value: ERR_INVALID_GRACE_PERIOD };
    }
    if (interestRate > 20) {
      return { ok: false, value: ERR_INVALID_INTEREST_RATE };
    }
    if (penalty > 100) {
      return { ok: false, value: ERR_INVALID_PENALTY };
    }
    if (this.state.oraclesByName.has(name)) {
      return { ok: false, value: ERR_ORACLE_ALREADY_EXISTS };
    }
    if (!this.state.authorityContract) {
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    }
    this.stxTransfers.push({ amount: this.state.reportFee, from: this.caller, to: this.state.authorityContract });
    const id = this.state.nextOracleId;
    const oracle: Oracle = {
      oraclePrincipal: this.caller,
      name,
      location,
      status: true,
      timestamp: this.blockHeight,
      votingThreshold,
      gracePeriod,
      interestRate,
      penalty,
    };
    this.state.oracles.set(id, oracle);
    this.state.oraclesByName.set(name, id);
    this.state.nextOracleId++;
    return { ok: true, value: id };
  }

  updateOracle(
    oracleId: number,
    updateName: string,
    updateLocation: string,
    updateVotingThreshold: number
  ): Result<boolean> {
    const oracle = this.state.oracles.get(oracleId);
    if (!oracle) {
      return { ok: false, value: ERR_ORACLE_NOT_FOUND };
    }
    if (oracle.oraclePrincipal !== this.caller) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (!updateName || updateName.length > 50) {
      return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    }
    if (!updateLocation || updateLocation.length > 100) {
      return { ok: false, value: ERR_INVALID_LOCATION };
    }
    if (updateVotingThreshold <= 0 || updateVotingThreshold > 100) {
      return { ok: false, value: ERR_INVALID_VOTING_THRESHOLD };
    }
    if (this.state.oraclesByName.has(updateName) && this.state.oraclesByName.get(updateName) !== oracleId) {
      return { ok: false, value: ERR_ORACLE_ALREADY_EXISTS };
    }
    const updated: Oracle = {
      ...oracle,
      name: updateName,
      location: updateLocation,
      timestamp: this.blockHeight,
      votingThreshold: updateVotingThreshold,
    };
    this.state.oracles.set(oracleId, updated);
    this.state.oraclesByName.delete(oracle.name);
    this.state.oraclesByName.set(updateName, oracleId);
    return { ok: true, value: true };
  }

  reportPayment(
    invoiceId: number,
    timestamp: number,
    amount: number,
    currency: string,
    early: boolean,
    gracePeriod: number,
    interestRate: number,
    penalty: number
  ): Result<boolean> {
    if (!this.state.oraclesByName.has(this.caller)) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (timestamp < this.blockHeight) {
      return { ok: false, value: ERR_INVALID_TIMESTAMP };
    }
    if (amount <= 0) {
      return { ok: false, value: ERR_INVALID_AMOUNT };
    }
    if (!["STX", "USD", "BTC"].includes(currency)) {
      return { ok: false, value: ERR_INVALID_CURRENCY };
    }
    if (gracePeriod > 30) {
      return { ok: false, value: ERR_INVALID_GRACE_PERIOD };
    }
    if (interestRate > 20) {
      return { ok: false, value: ERR_INVALID_INTEREST_RATE };
    }
    if (penalty > 100) {
      return { ok: false, value: ERR_INVALID_PENALTY };
    }
    if (this.state.verifiedPayments.has(invoiceId)) {
      return { ok: false, value: ERR_PAYMENT_ALREADY_VERIFIED };
    }
    let reports = this.state.paymentReports.get(invoiceId) || [];
    if (reports.length >= this.state.maxReportsPerInvoice) {
      return { ok: false, value: ERR_INVALID_MAX_REPORTS };
    }
    const payment: Payment = {
      invoiceId,
      timestamp,
      amount,
      currency,
      early,
      reporter: this.caller,
      status: true,
      gracePeriod,
      interestRate,
      penalty,
    };
    this.state.verifiedPayments.set(invoiceId, payment);
    reports = [...reports, invoiceId];
    this.state.paymentReports.set(invoiceId, reports);
    return { ok: true, value: true };
  }

  getOracleCount(): Result<number> {
    return { ok: true, value: this.state.nextOracleId };
  }

  checkOracleExistence(name: string): Result<boolean> {
    return { ok: true, value: this.state.oraclesByName.has(name) };
  }
}

describe("PaymentOracle", () => {
  let contract: PaymentOracleMock;

  beforeEach(() => {
    contract = new PaymentOracleMock();
    contract.reset();
  });

  it("registers an oracle successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerOracle(
      "Oracle1",
      "LocationX",
      50,
      7,
      10,
      5
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const oracle = contract.state.oracles.get(0);
    expect(oracle?.name).toBe("Oracle1");
    expect(oracle?.location).toBe("LocationX");
    expect(oracle?.votingThreshold).toBe(50);
    expect(oracle?.gracePeriod).toBe(7);
    expect(oracle?.interestRate).toBe(10);
    expect(oracle?.penalty).toBe(5);
    expect(contract.stxTransfers).toEqual([{ amount: 100, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate oracle names", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerOracle(
      "Oracle1",
      "LocationX",
      50,
      7,
      10,
      5
    );
    const result = contract.registerOracle(
      "Oracle1",
      "LocationY",
      60,
      14,
      15,
      10
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ORACLE_ALREADY_EXISTS);
  });

  it("rejects oracle registration without authority contract", () => {
    const result = contract.registerOracle(
      "NoAuth",
      "LocationX",
      50,
      7,
      10,
      5
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid voting threshold", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerOracle(
      "InvalidThreshold",
      "LocationX",
      101,
      7,
      10,
      5
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_VOTING_THRESHOLD);
  });

  it("updates an oracle successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerOracle(
      "OldOracle",
      "OldLocation",
      50,
      7,
      10,
      5
    );
    const result = contract.updateOracle(0, "NewOracle", "NewLocation", 60);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const oracle = contract.state.oracles.get(0);
    expect(oracle?.name).toBe("NewOracle");
    expect(oracle?.location).toBe("NewLocation");
    expect(oracle?.votingThreshold).toBe(60);
  });

  it("rejects update for non-existent oracle", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateOracle(99, "NewOracle", "NewLocation", 60);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ORACLE_NOT_FOUND);
  });

  it("rejects update by non-owner", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerOracle(
      "TestOracle",
      "LocationX",
      50,
      7,
      10,
      5
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateOracle(0, "NewOracle", "NewLocation", 60);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("reports a payment successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerOracle(
      "ST1TEST",
      "LocationX",
      50,
      7,
      10,
      5
    );
    const result = contract.reportPayment(
      1,
      100,
      500,
      "STX",
      true,
      7,
      10,
      5
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const payment = contract.state.verifiedPayments.get(1);
    expect(payment?.invoiceId).toBe(1);
    expect(payment?.timestamp).toBe(100);
    expect(payment?.amount).toBe(500);
    expect(payment?.currency).toBe("STX");
    expect(payment?.early).toBe(true);
    expect(payment?.gracePeriod).toBe(7);
    expect(payment?.interestRate).toBe(10);
    expect(payment?.penalty).toBe(5);
  });

  it("rejects payment report by non-oracle", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.reportPayment(
      1,
      100,
      500,
      "STX",
      true,
      7,
      10,
      5
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects duplicate payment verification", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerOracle(
      "ST1TEST",
      "LocationX",
      50,
      7,
      10,
      5
    );
    contract.reportPayment(
      1,
      100,
      500,
      "STX",
      true,
      7,
      10,
      5
    );
    const result = contract.reportPayment(
      1,
      200,
      600,
      "USD",
      false,
      14,
      15,
      10
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PAYMENT_ALREADY_VERIFIED);
  });

  it("rejects invalid timestamp", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerOracle(
      "ST1TEST",
      "LocationX",
      50,
      7,
      10,
      5
    );
    contract.blockHeight = 150;
    const result = contract.reportPayment(
      1,
      100,
      500,
      "STX",
      true,
      7,
      10,
      5
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TIMESTAMP);
  });

  it("sets report fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setReportFee(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.reportFee).toBe(200);
    contract.registerOracle(
      "Oracle1",
      "LocationX",
      50,
      7,
      10,
      5
    );
    expect(contract.stxTransfers).toEqual([{ amount: 200, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("returns correct oracle count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerOracle(
      "Oracle1",
      "LocationX",
      50,
      7,
      10,
      5
    );
    contract.registerOracle(
      "Oracle2",
      "LocationY",
      60,
      14,
      15,
      10
    );
    const result = contract.getOracleCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks oracle existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerOracle(
      "TestOracle",
      "LocationX",
      50,
      7,
      10,
      5
    );
    const result = contract.checkOracleExistence("TestOracle");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkOracleExistence("NonExistent");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("parses oracle parameters with Clarity types", () => {
    const name = stringUtf8CV("TestOracle");
    const votingThreshold = uintCV(50);
    expect(name.value).toBe("TestOracle");
    expect(votingThreshold.value).toEqual(BigInt(50));
  });

  it("rejects oracle registration with empty name", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerOracle(
      "",
      "LocationX",
      50,
      7,
      10,
      5
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_UPDATE_PARAM);
  });

  it("rejects oracle registration with max oracles exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxOracles = 1;
    contract.registerOracle(
      "Oracle1",
      "LocationX",
      50,
      7,
      10,
      5
    );
    const result = contract.registerOracle(
      "Oracle2",
      "LocationY",
      60,
      14,
      15,
      10
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ORACLES_EXCEEDED);
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
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });
});