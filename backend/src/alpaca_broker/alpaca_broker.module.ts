import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AccountsModule } from 'src/accounts/accounts.module';
import { AlpacaBrokerService } from './services/alpaca_broker.service';
import { ValidateDataAccountProvider } from './services/validate_data_account.provider';
import { FundCapitalAccount } from './services/fund_capital_account.provide';
import { TransactionsModule } from 'src/transactions/transactions.module';

@Module({
  exports: [AlpacaBrokerService, ValidateDataAccountProvider],
  providers: [
    AlpacaBrokerService,
    ValidateDataAccountProvider,
    FundCapitalAccount,
  ],
  imports: [
    forwardRef(() => AccountsModule),
    forwardRef(() => TransactionsModule),
    ConfigModule,
    TransactionsModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        baseURL: configService.get('ALPACA_BROKER_BASE_URL'),
        timeout: configService.get('TIMEOUT'),
        headers: {
          Authorization: `Basic ${configService.get('ALPACA_BROKER_CREDENTIAL_BASE64')}`,
        },
      }),
    }),
  ],
  controllers: [],
})
export class AlpacaBrokerModule {}
