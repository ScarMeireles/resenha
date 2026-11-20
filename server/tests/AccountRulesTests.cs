namespace Resenha.Api.Tests;

public class AccountRulesTests
{
    [Theory]
    [InlineData("@Joao_Silva", "joao_silva")]
    [InlineData("  maria.s  ", "maria.s")]
    [InlineData(null, "")]
    public void NormalizeUsername_remove_arroba_espacos_e_maiusculas(string? raw, string expected) =>
        Assert.Equal(expected, AccountRules.NormalizeUsername(raw));

    [Theory]
    [InlineData("abc")]
    [InlineData("joao_silva.99")]
    [InlineData("abcdefghijklmnopqrst")] // 20
    public void ValidateUsername_aceita_validos(string username) =>
        Assert.Null(AccountRules.ValidateUsername(username));

    [Theory]
    [InlineData("ab")]                    // curto
    [InlineData("abcdefghijklmnopqrstu")] // 21
    [InlineData("joão")]                  // acento
    [InlineData("joao-silva")]            // hífen
    [InlineData("joao silva")]            // espaço
    public void ValidateUsername_recusa_invalidos(string username) =>
        Assert.NotNull(AccountRules.ValidateUsername(username));

    [Theory]
    [InlineData("Abcde!")]           // 6, mínimo
    [InlineData("Abcdefghijklmn!")]  // 15, máximo
    [InlineData("Çãoxyz#")]          // letras acentuadas contam
    public void ValidatePassword_aceita_validas(string password) =>
        Assert.Empty(AccountRules.ValidatePassword(password));

    [Theory]
    [InlineData("Abcd!", "de 6 a 15")]            // 5
    [InlineData("Abcdefghijklmno!", "de 6 a 15")] // 16
    [InlineData("abcdef!", "maiúscula")]
    [InlineData("ABCDEF!", "minúscula")]
    [InlineData("Abcdef1", "especial")]
    [InlineData("Abc def", "especial")]           // espaço não conta como especial
    [InlineData(null, "de 6 a 15")]
    public void ValidatePassword_explica_o_que_falta(string? password, string expectedFragment) =>
        Assert.Contains(AccountRules.ValidatePassword(password), e => e.Contains(expectedFragment));

    [Theory]
    [InlineData("", false)]
    [InlineData("Ana", true)]
    [InlineData("12345678901234567890123456789012", true)]   // 32
    [InlineData("123456789012345678901234567890123", false)] // 33
    public void ValidateDisplayName(string name, bool valid) =>
        Assert.Equal(valid, AccountRules.ValidateDisplayName(name) is null);
}
