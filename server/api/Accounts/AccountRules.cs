using System.Text.RegularExpressions;

namespace Resenha.Api;

/// <summary>Regras de conta decididas para o Resenha. Mensagens em português, prontas para a tela.</summary>
public static partial class AccountRules
{
    public const int UsernameMinLength = 3;
    public const int UsernameMaxLength = 20;
    public const int DisplayNameMaxLength = 32;
    public const int PasswordMinLength = 6;
    public const int PasswordMaxLength = 15;

    [GeneratedRegex("^[a-z0-9_.]+$")]
    private static partial Regex UsernameChars();

    /// <summary>Aceita "@Joao" ou "joao" e devolve "joao". Não valida.</summary>
    public static string NormalizeUsername(string? raw) =>
        (raw ?? "").Trim().TrimStart('@').ToLowerInvariant();

    /// <summary>Valida um @ já normalizado. Retorna null quando está tudo certo.</summary>
    public static string? ValidateUsername(string username)
    {
        if (username.Length < UsernameMinLength || username.Length > UsernameMaxLength)
            return $"O @ precisa ter de {UsernameMinLength} a {UsernameMaxLength} caracteres.";
        if (!UsernameChars().IsMatch(username))
            return "O @ só pode ter letras de a a z, números, _ e ponto.";
        return null;
    }

    public static string? ValidateDisplayName(string displayName)
    {
        if (displayName.Length == 0)
            return "Informe um nome.";
        if (displayName.Length > DisplayNameMaxLength)
            return $"O nome pode ter no máximo {DisplayNameMaxLength} caracteres.";
        return null;
    }

    /// <summary>De 6 a 15 caracteres, com pelo menos uma maiúscula, uma minúscula e um caractere especial.</summary>
    public static List<string> ValidatePassword(string? password)
    {
        var errors = new List<string>();
        password ??= "";

        if (password.Length < PasswordMinLength || password.Length > PasswordMaxLength)
            errors.Add($"A senha precisa ter de {PasswordMinLength} a {PasswordMaxLength} caracteres.");
        if (!password.Any(char.IsUpper))
            errors.Add("A senha precisa ter pelo menos uma letra maiúscula.");
        if (!password.Any(char.IsLower))
            errors.Add("A senha precisa ter pelo menos uma letra minúscula.");
        if (!password.Any(c => !char.IsLetterOrDigit(c) && !char.IsWhiteSpace(c)))
            errors.Add("A senha precisa ter pelo menos um caractere especial (ex.: ! @ # $ %).");

        return errors;
    }
}
