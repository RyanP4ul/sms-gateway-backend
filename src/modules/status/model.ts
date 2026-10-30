import { t, type UnwrapSchema } from 'elysia';
import { enumOf } from '@/lib/schema';
import { componentStatus, incidentSeverity, incidentStatus } from '@/db';

export const StatusModel = {
  componentBody: t.Object({
    component: t.String(),
    status: enumOf(componentStatus.enumValues),
    message: t.Optional(t.String()),
  }),
  createIncidentBody: t.Object({
    title: t.String(),
    description: t.Optional(t.String()),
    severity: t.Optional(enumOf(incidentSeverity.enumValues)),
    affected_components: t.Optional(t.Array(t.String())),
  }),
  updateIncidentBody: t.Object({
    id: t.Numeric(),
    status: enumOf(incidentStatus.enumValues),
    description: t.Optional(t.String()),
  }),
  incidentsQuery: t.Object({ status: t.Optional(enumOf(incidentStatus.enumValues)), limit: t.Optional(t.Numeric()) }),
} as const;

export type StatusModel = { [k in keyof typeof StatusModel]: UnwrapSchema<(typeof StatusModel)[k]> };
