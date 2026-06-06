/**
 * In-memory Supabase client mock matching just enough of the surface we use.
 *
 * Chainable builder: .from(table).select|insert|update|upsert + .eq/.in/.neq/.ilike/.or/.order/.limit
 * + .single / .maybeSingle / await (then). Plus auth.getUser.
 *
 * Inspect state via `client._db[table]` and operation counts via `client._counts`.
 */

export type MockDb = Record<string, any[]>;

export interface MockSupabaseOptions {
    user: { id: string } | null;
    seed?: MockDb;
}

interface OpCounts {
    select: number;
    insert: number;
    upsert: number;
    update: number;
}

export interface MockSupabaseClient {
    auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
    from: (table: string) => Builder;
    _db: MockDb;
    _counts: Record<string, OpCounts>;
}

interface Builder {
    select: (cols?: string) => Builder;
    insert: (rows: any | any[]) => Builder;
    upsert: (rows: any | any[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => Builder;
    update: (patch: any) => Builder;
    eq: (col: string, val: any) => Builder;
    in: (col: string, vals: any[]) => Builder;
    neq: (col: string, val: any) => Builder;
    ilike: (col: string, pattern: string) => Builder;
    or: (expr: string) => Builder;
    order: (col: string, opts?: any) => Builder;
    limit: (n: number) => Builder;
    single: () => Promise<{ data: any; error: any }>;
    maybeSingle: () => Promise<{ data: any; error: any }>;
    then: (onFulfilled: (result: { data: any; error: any }) => any) => Promise<any>;
}

export function createMockSupabase(opts: MockSupabaseOptions): MockSupabaseClient {
    const db: MockDb = {};
    for (const [table, rows] of Object.entries(opts.seed ?? {})) {
        db[table] = JSON.parse(JSON.stringify(rows));
    }
    const counts: Record<string, OpCounts> = {};
    const bumpCount = (table: string, op: keyof OpCounts) => {
        counts[table] = counts[table] ?? { select: 0, insert: 0, upsert: 0, update: 0 };
        counts[table][op]++;
    };

    function buildBuilder(table: string): Builder {
        const filters: Array<(row: any) => boolean> = [];
        let mode: 'select' | 'insert' | 'upsert' | 'update' | null = null;
        let pendingPatch: any = null;
        let pendingRows: any[] = [];
        let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
        let orderCol: string | null = null;
        let orderAsc = true;
        let limitN: number | null = null;

        const ensureTable = () => {
            if (!db[table]) db[table] = [];
            return db[table];
        };

        const applyFilters = (rows: any[]) => rows.filter((r) => filters.every((f) => f(r)));

        const applyOrderLimit = (rows: any[]) => {
            let out = rows;
            if (orderCol) {
                out = [...out].sort((a, b) => {
                    const av = a[orderCol!];
                    const bv = b[orderCol!];
                    if (av === bv) return 0;
                    if (av === null || av === undefined) return orderAsc ? 1 : -1;
                    if (bv === null || bv === undefined) return orderAsc ? -1 : 1;
                    if (av < bv) return orderAsc ? -1 : 1;
                    return orderAsc ? 1 : -1;
                });
            }
            if (limitN !== null) out = out.slice(0, limitN);
            return out;
        };

        const execute = (): { data: any; error: any } => {
            const rows = ensureTable();
            if (mode === 'select' || mode === null) {
                bumpCount(table, 'select');
                return { data: applyOrderLimit(applyFilters(rows)), error: null };
            }
            if (mode === 'insert') {
                bumpCount(table, 'insert');
                rows.push(...pendingRows);
                return { data: pendingRows, error: null };
            }
            if (mode === 'upsert') {
                bumpCount(table, 'upsert');
                const onConflictKey = upsertOpts.onConflict ?? 'id';
                const inserted: any[] = [];
                for (const incoming of pendingRows) {
                    const existingIdx = rows.findIndex((r) => r[onConflictKey] === incoming[onConflictKey]);
                    if (existingIdx === -1) {
                        rows.push(incoming);
                        inserted.push(incoming);
                    } else if (!upsertOpts.ignoreDuplicates) {
                        rows[existingIdx] = { ...rows[existingIdx], ...incoming };
                        inserted.push(rows[existingIdx]);
                    }
                }
                return { data: inserted, error: null };
            }
            if (mode === 'update') {
                bumpCount(table, 'update');
                const matched = applyFilters(rows);
                for (const m of matched) Object.assign(m, pendingPatch);
                return { data: matched, error: null };
            }
            return { data: null, error: null };
        };

        // Convert a SQL ILIKE pattern with %wild% to a case-insensitive regex
        const ilikeToRegex = (pattern: string) => {
            const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
            return new RegExp(`^${escaped}$`, 'i');
        };

        const builder: Builder = {
            select: () => { if (mode === null) mode = 'select'; return builder; },
            insert: (incoming) => {
                mode = 'insert';
                pendingRows = Array.isArray(incoming) ? incoming : [incoming];
                return builder;
            },
            upsert: (incoming, options) => {
                mode = 'upsert';
                pendingRows = Array.isArray(incoming) ? incoming : [incoming];
                upsertOpts = options ?? {};
                return builder;
            },
            update: (patch) => { mode = 'update'; pendingPatch = patch; return builder; },
            eq: (col, val) => { filters.push((r) => r[col] === val); return builder; },
            in: (col, vals) => { filters.push((r) => vals.includes(r[col])); return builder; },
            neq: (col, val) => { filters.push((r) => r[col] !== val); return builder; },
            ilike: (col, pattern) => {
                const re = ilikeToRegex(pattern);
                filters.push((r) => typeof r[col] === 'string' && re.test(r[col]));
                return builder;
            },
            // Limited .or() — supports comma-separated clauses, only "col.eq.val" and "col.not.is.null"
            or: (expr) => {
                const clauses = expr.split(',').map((c) => c.trim());
                const matchers = clauses.map((clause) => {
                    const eqMatch = clause.match(/^(\w+)\.eq\.(.+)$/);
                    if (eqMatch) {
                        const [, col, valRaw] = eqMatch;
                        const val: any = valRaw === 'null' ? null : valRaw;
                        return (r: any) => r[col] === val;
                    }
                    const notNullMatch = clause.match(/^(\w+)\.not\.is\.null$/);
                    if (notNullMatch) {
                        const [, col] = notNullMatch;
                        return (r: any) => r[col] !== null && r[col] !== undefined;
                    }
                    return () => false;
                });
                filters.push((r) => matchers.some((m) => m(r)));
                return builder;
            },
            order: (col, options) => {
                orderCol = col;
                orderAsc = options?.ascending !== false;
                return builder;
            },
            limit: (n) => { limitN = n; return builder; },
            single: async () => {
                const result = execute();
                if (result.error) return result;
                const arr = result.data as any[];
                if (!arr || arr.length === 0) {
                    return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
                }
                if (arr.length > 1) {
                    return { data: null, error: { message: 'Multiple rows found' } };
                }
                return { data: arr[0], error: null };
            },
            maybeSingle: async () => {
                const result = execute();
                if (result.error) return result;
                const arr = result.data as any[];
                if (!arr || arr.length === 0) return { data: null, error: null };
                return { data: arr[0], error: null };
            },
            then: (onFulfilled) => Promise.resolve(execute()).then(onFulfilled),
        };

        return builder;
    }

    return {
        auth: {
            getUser: async () => ({ data: { user: opts.user } }),
        },
        from: (table) => buildBuilder(table),
        _db: db,
        _counts: counts,
    };
}
