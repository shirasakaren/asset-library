import { Global, Module } from '@nestjs/common';
import { FlexibleAuthGuard } from './flexible-auth.guard';
import { KeycloakAuthGuard } from './keycloak-auth.guard';
import { KeycloakJwksProvider } from './keycloak-jwks.provider';
import { OptionalAuthGuard } from './optional-auth.guard';
import { PluginTokenGuard } from './plugin-token.guard';
import { PluginTokenService } from './plugin-token.service';
import { PrincipalResolverService } from './principal-resolver.service';
import { RoleResolverService } from './role-resolver.service';

/**
 * Keycloak integration:
 *   - KeycloakJwksProvider:   JWKS verifier (jose).
 *   - KeycloakAuthGuard:      Bearer-token guard, upserts User.
 *   - PluginTokenService:     issues/refreshes/revokes long-lived plugin tokens.
 *   - PluginTokenGuard:       authenticates `Authorization: PluginToken …`.
 *   - FlexibleAuthGuard:      accepts either scheme on the same endpoint.
 *   - OptionalAuthGuard:      same as Flexible but lets guests through.
 *   - RoleResolverService:    derives admin/contributor/user from User + Asset.
 *
 * None of these are registered as APP_GUARD — controllers decide per-route.
 */
@Global()
@Module({
  providers: [
    KeycloakJwksProvider,
    RoleResolverService,
    PrincipalResolverService,
    KeycloakAuthGuard,
    PluginTokenService,
    PluginTokenGuard,
    FlexibleAuthGuard,
    OptionalAuthGuard,
  ],
  exports: [
    KeycloakJwksProvider,
    RoleResolverService,
    PrincipalResolverService,
    KeycloakAuthGuard,
    PluginTokenService,
    PluginTokenGuard,
    FlexibleAuthGuard,
    OptionalAuthGuard,
  ],
})
export class KeycloakModule {}
