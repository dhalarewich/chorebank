async function main() {
  console.log("No database seed is provided. Run npm run setup to create a household.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    process.exit(0);
  });
