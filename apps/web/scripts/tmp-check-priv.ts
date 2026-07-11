import { eq } from 'drizzle-orm';
import { createDbClient, profiles } from '@era/db';
const db = createDbClient(process.env.DATABASE_URL!);
const [p] = await db.select({ u: profiles.username, priv: profiles.isPrivate }).from(profiles).where(eq(profiles.username, 'guy4carbs')).limit(1);
console.log(JSON.stringify(p));
