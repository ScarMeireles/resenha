using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Resenha.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ConversasDiretas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "GroupId",
                table: "Messages",
                type: "TEXT",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "TEXT");

            migrationBuilder.AddColumn<Guid>(
                name: "ConversationId",
                table: "Messages",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "DirectConversations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserAId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserBId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DirectConversations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DirectConversations_Users_UserAId",
                        column: x => x.UserAId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DirectConversations_Users_UserBId",
                        column: x => x.UserBId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Messages_ConversationId_CreatedAt",
                table: "Messages",
                columns: new[] { "ConversationId", "CreatedAt" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Messages_GrupoOuConversa",
                table: "Messages",
                sql: "(\"GroupId\" IS NULL) <> (\"ConversationId\" IS NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_DirectConversations_UserAId_UserBId",
                table: "DirectConversations",
                columns: new[] { "UserAId", "UserBId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DirectConversations_UserBId",
                table: "DirectConversations",
                column: "UserBId");

            migrationBuilder.AddForeignKey(
                name: "FK_Messages_DirectConversations_ConversationId",
                table: "Messages",
                column: "ConversationId",
                principalTable: "DirectConversations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Messages_DirectConversations_ConversationId",
                table: "Messages");

            migrationBuilder.DropTable(
                name: "DirectConversations");

            migrationBuilder.DropIndex(
                name: "IX_Messages_ConversationId_CreatedAt",
                table: "Messages");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Messages_GrupoOuConversa",
                table: "Messages");

            migrationBuilder.DropColumn(
                name: "ConversationId",
                table: "Messages");

            migrationBuilder.AlterColumn<Guid>(
                name: "GroupId",
                table: "Messages",
                type: "TEXT",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "TEXT",
                oldNullable: true);
        }
    }
}
