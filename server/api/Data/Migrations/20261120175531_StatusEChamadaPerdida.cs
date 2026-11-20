using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Resenha.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class StatusEChamadaPerdida : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "Users",
                type: "TEXT",
                maxLength: 16,
                nullable: false,
                defaultValue: "online");

            migrationBuilder.CreateTable(
                name: "MissedCalls",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CallerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CalleeId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MissedCalls", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MissedCalls_Users_CalleeId",
                        column: x => x.CalleeId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MissedCalls_Users_CallerId",
                        column: x => x.CallerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MissedCalls_CalleeId_CreatedAt",
                table: "MissedCalls",
                columns: new[] { "CalleeId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MissedCalls_CallerId",
                table: "MissedCalls",
                column: "CallerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MissedCalls");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Users");
        }
    }
}
