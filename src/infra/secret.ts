import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

class AwsSecretsManager {
  client: SecretsManagerClient;

  private constructor(client: SecretsManagerClient) {
    this.client = client;
  }

  public static createClient() {
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
    return new AwsSecretsManager(client);
  }

  public async getSecret(keyName: string): Promise<string | undefined> {
    const secretId = process.env.AWS_SECRET_ID || 'juri-api-prd';

    try {
      const command = new GetSecretValueCommand({ SecretId: secretId });
      const response = await this.client.send(command);

      const raw =
        response.SecretString ??
        (response.SecretBinary
          ? Buffer.from(
              response.SecretBinary as unknown as string,
              'base64',
            ).toString('utf-8')
          : undefined);

      if (!raw) {
        throw new Error(`Secret sem conteúdo (SecretString/SecretBinary)`);
      }

      try {
        const obj = JSON.parse(raw) as Record<string, string | undefined>;
        return obj[keyName];
      } catch {
        const map: Record<string, string> = {};
        for (const line of raw.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;

          const idx = trimmed.indexOf('=');
          if (idx === -1) continue;

          const k = trimmed.slice(0, idx).trim();
          let v = trimmed.slice(idx + 1).trim();

          if (
            (v.startsWith('"') && v.endsWith('"')) ||
            (v.startsWith("'") && v.endsWith("'"))
          ) {
            v = v.slice(1, -1);
          }

          map[k] = v;
        }

        return map[keyName];
      }
    } catch (err) {
      throw new Error(
        `Erro ao buscar secret "${keyName}" no AWS Secrets Manager (SecretId=${secretId}): ${JSON.stringify(
          err,
        )}`,
      );
    }
  }
}

class SecretManager {
  private static instance: AwsSecretsManager;

  public static getInstance() {
    //FIXME: For now we only have AWS Secrets Manager
    SecretManager.instance = AwsSecretsManager.createClient();
    return SecretManager.instance;
  }
}

export const secretManager = SecretManager.getInstance();
