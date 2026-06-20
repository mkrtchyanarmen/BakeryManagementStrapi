import type { Core } from '@strapi/strapi';

type RelationInput =
  | string
  | number
  | { id?: number; documentId?: string }
  | { connect?: Array<string | number | { id?: number; documentId?: string }> }
  | null
  | undefined;

export function getRelationRef(relation: RelationInput): string | number | null {
  if (relation == null) {
    return null;
  }

  if (typeof relation === 'string' || typeof relation === 'number') {
    return relation;
  }

  if ('connect' in relation && Array.isArray(relation.connect)) {
    const first = relation.connect[0];
    if (first == null) {
      return null;
    }
    if (typeof first === 'string' || typeof first === 'number') {
      return first;
    }
    return first.documentId ?? first.id ?? null;
  }

  if ('documentId' in relation && relation.documentId) {
    return relation.documentId;
  }

  if ('id' in relation && relation.id != null) {
    return relation.id;
  }

  return null;
}

export async function findOneByRef<T extends { id: number }>(
  strapi: Core.Strapi,
  uid: string,
  ref: string | number,
): Promise<T | null> {
  const isNumeric = typeof ref === 'number' || /^\d+$/.test(String(ref));

  if (isNumeric) {
    const byId = await strapi.db.query(uid).findOne({
      where: { id: Number(ref) },
    });
    if (byId) {
      return byId as T;
    }
  }

  const byDocumentId = await strapi.db.query(uid).findOne({
    where: { documentId: String(ref) },
  });

  return (byDocumentId as T | null) ?? null;
}

export function getEntityId(entity: { id?: number } | number | null | undefined): number | null {
  if (entity == null) {
    return null;
  }

  if (typeof entity === 'number') {
    return entity;
  }

  return entity.id ?? null;
}
