namespace Resenha.Api.Groups;

/// <summary>Regras de grupos e chat, num lugar só (podem ser ajustadas aqui).</summary>
public static class GroupRules
{
    public const int MaxMembers = 10;
    public const int NameMinLength = 1;
    public const int NameMaxLength = 40;
    public const int MessageMaxLength = 2000;
    public const int MaxImagesPerMessage = 4;
    public const int PageSize = 50;
    public const int MaxPageSize = 100;

    /// <summary>Valida um nome já com trim. Retorna null quando está tudo certo.</summary>
    public static string? ValidateName(string name)
    {
        if (name.Length < NameMinLength)
            return "Informe um nome para o grupo.";
        if (name.Length > NameMaxLength)
            return $"O nome pode ter no máximo {NameMaxLength} caracteres.";
        return null;
    }
}
