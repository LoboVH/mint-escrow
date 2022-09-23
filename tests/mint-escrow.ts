import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createInitializeMintInstruction,
  MINT_SIZE,
  createMintToInstruction,
} from "@solana/spl-token";
import { BN } from "bn.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";


import { MintEscrow } from "../target/types/mint_escrow";
import { ASSOCIATED_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";

describe("mint-escrow", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const { LAMPORTS_PER_SOL } = anchor.web3;

  const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
  );

  const mainProgram = anchor.workspace.MintEscrow as Program<MintEscrow>;


  const seller =  provider.wallet.publicKey;  // anchor.web3.Keypair.generate();
  const payer = (provider.wallet as NodeWallet).payer;
  const buyer =  anchor.web3.Keypair.generate();
  const escrowedXTokens = anchor.web3.Keypair.generate();
  let x_mint;
  let y_mint;
  let sellers_x_token;
  let sellers_y_token;
  let buyer_x_token;
  let buyer_y_token;
  let escrow: anchor.web3.PublicKey;



  const createMint = async (user) => {
    let mintKey = anchor.web3.Keypair.generate();
    const lamports =
      await mainProgram.provider.connection.getMinimumBalanceForRentExemption(
        MINT_SIZE
      );
    let associatedTokenAccount = await getAssociatedTokenAddress(
      mintKey.publicKey,
      user.key.publicKey
    );
  
    const mint_tx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: user.key.publicKey,
        newAccountPubkey: mintKey.publicKey,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
        lamports,
      }),
      createInitializeMintInstruction(
        mintKey.publicKey,
        0,
        user.key.publicKey,
        user.key.publicKey
      )
    );
  
    try {
      const userProgram = await programForUser(user);
      const signature = await userProgram.provider.sendAndConfirm(mint_tx, [
        user.key,
        mintKey,
      ]);
    } catch (e) {
      console.log("createMint() failed!", e);
      return null;
    }
  
    return mintKey;
  };


  const mintToken = async (mintKey, user) => {
    let associatedTokenAccount = await getAssociatedTokenAddress(
      mintKey.publicKey,
      user.key.publicKey
    );
  
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        user.key.publicKey,
        associatedTokenAccount,
        user.key.publicKey,
        mintKey.publicKey
      ),
      createMintToInstruction(
        mintKey.publicKey,
        associatedTokenAccount,
        user.key.publicKey,
        1
      )
    );
  
    try {
      const userProgram = await programForUser(user);
      const signature = await userProgram.provider.sendAndConfirm(tx, [user.key]);
    } catch (e) {
      console.log("mintTo() failed!", e);
      return null;
    }
  
    return associatedTokenAccount;
  };


  const getMetadata = async (mint) => {
    return (
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from("metadata"),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      )
    )[0];
  };


  

  

  const createUser = async (airdropBalance) => {
    airdropBalance = airdropBalance * LAMPORTS_PER_SOL;
    let user = anchor.web3.Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      user.publicKey,
      airdropBalance
    );

    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: sig,
    });

    let wallet = new anchor.Wallet(user);
    let userProvider = new anchor.AnchorProvider(
      provider.connection,
      wallet,
      provider.opts
    );

    return {
      key: user,
      wallet,
      provider: userProvider,
    };
};


const programForUser = async (user) => {
  return new anchor.Program(
    mainProgram.idl,
    mainProgram.programId,
    user.provider
  );
};



  before(async() => {

    await provider.connection.requestAirdrop(buyer.publicKey, 1*LAMPORTS_PER_SOL);
    //let program = await programForUser(buyer);
    // Derive escrow address
    [escrow] = await anchor.web3.PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode("escrow"),
      seller.toBuffer()
    ], 
    mainProgram.programId)

    x_mint = await splToken.createMint(
      provider.connection,
      payer,
      provider.wallet.publicKey,
      provider.wallet.publicKey,
      6
    );

    y_mint = await splToken.createMint(
      provider.connection,
      payer,
      provider.wallet.publicKey,
      null,
      6
    );


    

    // seller's x and y token account
    sellers_x_token = await splToken.createAssociatedTokenAccount(
      provider.connection,
      payer,
      x_mint,
      seller,
      {},
      TOKEN_PROGRAM_ID,
      ASSOCIATED_PROGRAM_ID,
    );
    
    await splToken.mintTo(
      provider.connection,
      payer,
      x_mint,
      sellers_x_token,
      seller,
      10_000_000_000,
      undefined,
      {},
      TOKEN_PROGRAM_ID
    );

    console.log("sellers y token");
    

    sellers_y_token = await splToken.createAssociatedTokenAccount(
      provider.connection,
      payer,
      y_mint,
      seller,
      {},
      TOKEN_PROGRAM_ID,
      ASSOCIATED_PROGRAM_ID,
    );    
    // buyer's x and y token account
    buyer_x_token = await splToken.createAssociatedTokenAccount(
      provider.connection,
      payer,
      x_mint,
      buyer.publicKey,
      {},
      TOKEN_PROGRAM_ID,
      ASSOCIATED_PROGRAM_ID,
    );
    buyer_y_token = await splToken.createAssociatedTokenAccount(
      provider.connection,
      payer,
      y_mint,
      buyer.publicKey,
      {},
      TOKEN_PROGRAM_ID,
      ASSOCIATED_PROGRAM_ID,
    );

    await splToken.mintTo(
      provider.connection,
      payer,
      y_mint,
      buyer_y_token,
      seller,
      10_000_000_000,
      undefined,
      {},
      TOKEN_PROGRAM_ID
    );
  })



  it("Mint Token", async () => {
    const user1 = await createUser(2);

    let program = await programForUser(user1);

    const mintKey = await createMint(user1);
    console.log("Mint key: ", mintKey.publicKey.toString());


    const tokenAccount = await mintToken(mintKey, user1);
    console.log("Owner Token Account: ", tokenAccount.toString());


    console.log("token Account: ", tokenAccount.toBase58());

    const metadataAddress = await getMetadata(mintKey.publicKey);

    console.log("metadata address", metadataAddress.toString());

    //const metadataUri = await ipfs_metadata_upload("regov", "LOBO", "Testing", "https://cdn.pixabay.com/photo/2020/11/24/10/37/tokyo-5772125__340.jpg" );

    const tx = await program.methods.mintToken(
      mintKey.publicKey,
      new BN(5),
      "regov",
      "LOBO",
      "https://cdn.pixabay.com/photo/2020/11/24/10/37/tokyo-5772125__340.jpg" // Metadata Uri goes here
    )
    .accounts({
      mintAuthority: user1.wallet.publicKey,
      mint: mintKey.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      metadata: metadataAddress,
      tokenAccount: tokenAccount,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      payer: user1.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY
    }).rpc();

    console.log("transaction successful", tx);


  });



  it("Initialize escrow", async () => {

    const x_amount = new anchor.BN(40);
    const y_amount = new anchor.BN(40);

    const tx1 = await mainProgram.methods.initialize(x_amount, y_amount)
      .accounts({
        seller: seller,
        xMint: x_mint,
        yMint: y_mint,
        sellerXToken: sellers_x_token,
        escrow: escrow,
        escrowedXTokens: escrowedXTokens.publicKey,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId
      })
      .signers([escrowedXTokens])
      .rpc();

    console.log("initialize escrow transaction", tx1);

  });



  it("Execute the trade", async () => { 
    const tx = await mainProgram.methods.accept()
      .accounts({
        buyer: buyer.publicKey,
        escrow: escrow,
        escrowedXTokens: escrowedXTokens.publicKey,
        sellersYTokens: sellers_y_token,
        buyerXTokens: buyer_x_token,
        buyerYTokens: buyer_y_token,
        tokenProgram: splToken.TOKEN_PROGRAM_ID
      })
      .signers([buyer])
      .rpc()
  });



  it("Cancle the trade", async () => { 
    const tx = await mainProgram.methods.cancel()
    .accounts({
      seller: seller,
      escrow: escrow,
      escrowedXTokens: escrowedXTokens.publicKey,
      sellerXToken: sellers_x_token,
      tokenProgram: splToken.TOKEN_PROGRAM_ID
    })
    .rpc()
  });



});
