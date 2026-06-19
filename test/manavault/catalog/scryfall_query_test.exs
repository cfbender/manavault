defmodule Manavault.Catalog.ScryfallQueryTest do
  use ExUnit.Case, async: true

  alias Manavault.Catalog.ScryfallQuery
  alias Manavault.Catalog.ScryfallQuery.{And, ExactName, Not, Or, Predicate}

  describe "parse/1" do
    test "parses empty input as an empty conjunction" do
      assert {:ok, %And{terms: []}} = ScryfallQuery.parse("  ")
    end

    test "parses loose text terms as name-like text predicates joined by AND" do
      assert {:ok,
              %And{
                terms: [
                  %Predicate{field: :text, op: :colon, value: "black"},
                  %Predicate{field: :text, op: :colon, value: "lotus"}
                ]
              }} = ScryfallQuery.parse("black lotus")
    end

    test "parses quoted loose text and exact card names" do
      assert {:ok, %Predicate{field: :text, value: "black lotus"}} =
               ScryfallQuery.parse(~s("black lotus"))

      assert {:ok, %ExactName{name: "Black Lotus"}} = ScryfallQuery.parse(~s(!"Black Lotus"))
    end

    test "normalizes field aliases" do
      assert {:ok,
              %And{
                terms: [
                  %Predicate{field: :type, value: "legendary"},
                  %Predicate{field: :oracle, value: "draw"},
                  %Predicate{field: :mana_value, op: :gte, value: "3"},
                  %Predicate{field: :colors, op: :lte, value: "uw"},
                  %Predicate{field: :identity, op: :eq, value: "g"},
                  %Predicate{field: :rarity, op: :neq, value: "common"},
                  %Predicate{field: :set, value: "tdc"},
                  %Predicate{field: :collector_number, op: :gt, value: "200"},
                  %Predicate{field: :language, value: "ja"}
                ]
              }} =
               ScryfallQuery.parse(
                 "t:legendary o:draw cmc>=3 color<=uw identity=g r!=common e:tdc cn>200 language:ja"
               )
    end

    test "parses OR groups, nested expressions, and negation" do
      assert {:ok,
              %And{
                terms: [
                  %Or{
                    terms: [
                      %Predicate{field: :text, value: "dragon"},
                      %And{
                        terms: [
                          %Predicate{field: :type, value: "angel"},
                          %Not{expr: %Predicate{field: :colors, value: "w"}}
                        ]
                      }
                    ]
                  },
                  %Not{expr: %Predicate{field: :is, value: "funny"}}
                ]
              }} = ScryfallQuery.parse("(dragon or (t:angel -c:w)) not:funny")
    end

    test "parses regex values without treating slash content as regular text" do
      assert {:ok, %Predicate{field: :oracle, value: "^draw.*card$", regex?: true}} =
               ScryfallQuery.parse("o:/^draw.*card$/")
    end

    test "returns useful errors for unbalanced syntax" do
      assert {:error, "missing closing parenthesis"} = ScryfallQuery.parse("(dragon or angel")
      assert {:error, "unterminated quoted phrase"} = ScryfallQuery.parse(~s(name:"Black Lotus))
      assert {:error, "unterminated regex"} = ScryfallQuery.parse("o:/draw")
    end
  end

  describe "to_query/1" do
    test "round trips canonical syntax for representative Scryfall filters" do
      queries = [
        "black lotus",
        ~s(!"Black Lotus"),
        ~s(name:"Black Lotus"),
        "type:legendary oracle:draw mana:{G} mv>=3",
        "c=2 id<=uw rarity>=rare set:tdc number>200 lang:ja",
        "usd<10 year>=2020 date<2025-01-01",
        "is:foil -is:funny",
        "(dragon or angel) -type:creature",
        "(type:artifact rarity:rare) or (type:sorcery rarity:mythic)",
        "oracle:/^draw.*card$/"
      ]

      for query <- queries do
        assert {:ok, first} = ScryfallQuery.parse(query)
        rendered = ScryfallQuery.to_query(first)
        assert {:ok, second} = ScryfallQuery.parse(rendered)
        assert second == first
      end
    end

    test "serializes aliases to canonical field names" do
      assert ScryfallQuery.parse!("t:artifact o:mana cmc=0 e:lea cn:232")
             |> ScryfallQuery.to_query() == "type:artifact oracle:mana mv=0 set:lea number:232"
    end
  end
end
