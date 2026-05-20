import type { DomainEvent } from "@gaurav-pos/shared";
import type { HubOrm } from "../../db/database.js";
import { eventLog, syncOutbox } from "../../db/drizzle-schema.js";
import { makeId } from "../ids.js";

export function appendDomainEvent(orm: HubOrm, type: string, aggregateType: string, aggregateId: string, payload: unknown): DomainEvent {
  const event: DomainEvent = {
    eventId: makeId("evt"),
    type,
    aggregateType,
    aggregateId,
    payload,
    createdAt: new Date().toISOString()
  };

  orm
    .insert(eventLog)
    .values({
      eventId: event.eventId,
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: JSON.stringify(event.payload),
      createdAt: event.createdAt
    })
    .run();

  orm
    .insert(syncOutbox)
    .values({
      eventId: event.eventId,
      status: "pending",
      attempts: 0,
      createdAt: event.createdAt,
      updatedAt: event.createdAt
    })
    .run();

  return event;
}
