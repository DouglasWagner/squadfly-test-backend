import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE, Database } from '../database/database.module';
import { Organization, organizations } from '../database/schema';

@Injectable()
export class OrganizationsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findByApiKey(apiKey: string): Promise<Organization> {
    const [organization] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.apiKey, apiKey))
      .limit(1);

    if (!organization) {
      throw new UnauthorizedException('Invalid organization API key.');
    }

    return organization;
  }
}
