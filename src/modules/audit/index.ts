import { Elysia } from 'elysia';
import { auth } from '@/plugins/auth';
import { AuditModel } from './model';
import { Audit } from './service';

export const auditModule = new Elysia({ prefix: '/audit-logs', tags: ['Audit'] })
  .use(auth)
  .get('/', ({ query }) => Audit.list(query), { admin: true, query: AuditModel.listQuery });
