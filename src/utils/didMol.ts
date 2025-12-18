import {
  mol,
  HexLike,
  hexFrom,
  Hex,
} from "@ckb-ccc/core";

// table DidCkbDataV1 {
//     document: Bytes,
//     localId: StringOpt,
// }
export type DidCkbDataV1Like = {
  document: HexLike;
  localId?: HexLike | null;
};

@mol.codec(
  mol.table({
    document: mol.Bytes,
    localId: mol.BytesOpt,
  }),
)

export class DidCkbDataV1 extends mol.Entity.Base<
  DidCkbDataV1Like,
  DidCkbDataV1
>() {
  constructor(
    public document: Hex,
    public localId?: Hex,
  ) {
    super();
  }

  static from(data: DidCkbDataV1Like): DidCkbDataV1 {
    if (data instanceof DidCkbDataV1) {
      return data;
    }
    return new DidCkbDataV1(
      hexFrom(data.document),
      data.localId ? hexFrom(data.localId) : undefined,
    );
  }
}

// union DidCkbData {
//   DidCkbDataV1,
// }

export type DidCkbDataLike = {
  value: DidCkbDataV1Like;
};

@mol.codec(
  mol.union({
    DidCkbDataV1,
  }),
)
export class DidCkbData extends mol.Entity.Base<DidCkbDataLike, DidCkbData>() {
  constructor(
    public type: "DidCkbDataV1",
    public value: DidCkbDataV1,
  ) {
    super();
  }

  static from(data: DidCkbDataLike): DidCkbData {
    if (data instanceof DidCkbData) {
      return data;
    }
    return new DidCkbData("DidCkbDataV1", DidCkbDataV1.from(data.value));
  }
}